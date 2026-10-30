import {
    MultiplyBlending,
    BackSide,
    BoxGeometry,
    PlaneGeometry,
	Mesh,
	ShaderMaterial,
	UniformsUtils,
    Vector3,
    Color
} from "./three.module.js";

import * as THREE from "./three.module.js";

/**
 * Based on "A Practical Analytic Model for Daylight"
 * aka The Preetham Model, the de facto standard analytic skydome model
 * https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight
 *
 * First implemented by Simon Wallner
 * http://simonwallner.at/project/atmospheric-scattering/
 *
 * Improved by Martin Upitis
 * http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
 *
 * Three.js integration by zz85 http://twitter.com/blurspline
*/

class Sky extends Mesh {

	constructor() {

		const shader = Sky.SkyShader;

		const material = new ShaderMaterial( {
			name: 'SkyShader',
			fragmentShader: shader.fragmentShader,
			vertexShader: shader.vertexShader,
			uniforms: UniformsUtils.clone( shader.uniforms ),
			side: BackSide,
			depthWrite: false
		} );

        super(new BoxGeometry(1, 1, 1), material);
        
        this.initClouds();

    }
    
    initClouds() {
            
        const shader = Sky.CloudsShader;
        
        const material = new ShaderMaterial({
            name: 'CloudsShader',
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            uniforms: UniformsUtils.clone( shader.uniforms ),
            side: BackSide,
            depthWrite: false,
            transparent: true,
        });

        this.clouds = new Mesh(new PlaneGeometry(2, 2, 2, 2), material);
        
        //move the vertices not on the edge of the plane by 0.1 on the z axis
        const positionAttribute = this.clouds.geometry.getAttribute("position");
        for (let i = 0; i < positionAttribute.count; i++){
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);

            if (x > -1 && x < 1 && y > -1 && y < 1){
                positionAttribute.setZ(i, 0.1);
            } else {
                positionAttribute.setZ(i, -0.1);
            }
        }

        //this.clouds.position.y = 0.01;
        this.clouds.rotation.x = - Math.PI / 2;

        this.add(this.clouds);
    }

}

Sky.prototype.isSky = true;

Sky.SkyShader = {
    uniforms: {
        turbidity: { value: 2 },
        rayleigh: { value: 1 },
        mieCoefficient: { value: 0.005 },
        mieDirectionalG: { value: 0.8 },
        sunPosition: { value: new Vector3() },
        up: { value: new Vector3(0, 1, 0) },
        skyTint: {value: new Color(0xffffff)},
        starAlpha: {value: 0.0},
        starDensity: {value: 1.0},
        time: {value: 0.0},
        cloudDensity: {value: 1.0},
    },

    vertexShader: /* glsl */ `
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;
        uniform vec3 skyTint;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( dot( vSunDirection, up ) );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorbtion + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,

    fragmentShader: /* glsl */ `
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform vec3 up;
        uniform vec3 skyTint;
        uniform float starAlpha;
        uniform float starDensity;
        uniform float time;


		const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

                // 3D Gradient noise from: https://www.shadertoy.com/view/Xsl3Dl
        vec3 hash( vec3 p ) // replace this by something better
        {
            p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
                    dot(p,vec3(269.5,183.3,246.1)),
                    dot(p,vec3(113.5,271.9,124.6)));

            return -1.0 + 2.0*fract(sin(p)*43758.5453123);
        }
        float noise( in vec3 p )
        {
            vec3 i = floor( p );
            vec3 f = fract( p );
            
            vec3 u = f*f*(3.0-2.0*f);

            return mix( mix( mix( dot( hash( i + vec3(0.0,0.0,0.0) ), f - vec3(0.0,0.0,0.0) ),
                                dot( hash( i + vec3(1.0,0.0,0.0) ), f - vec3(1.0,0.0,0.0) ), u.x),
                            mix( dot( hash( i + vec3(0.0,1.0,0.0) ), f - vec3(0.0,1.0,0.0) ),
                                dot( hash( i + vec3(1.0,1.0,0.0) ), f - vec3(1.0,1.0,0.0) ), u.x), u.y),
                        mix( mix( dot( hash( i + vec3(0.0,0.0,1.0) ), f - vec3(0.0,0.0,1.0) ),
                                dot( hash( i + vec3(1.0,0.0,1.0) ), f - vec3(1.0,0.0,1.0) ), u.x),
                            mix( dot( hash( i + vec3(0.0,1.0,1.0) ), f - vec3(0.0,1.0,1.0) ),
                                dot( hash( i + vec3(1.0,1.0,1.0) ), f - vec3(1.0,1.0,1.0) ), u.x), u.y), u.z );
        }

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPos );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
			L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

			vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

			vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

            retColor *= skyTint;

            // Stars computation:
            if(starAlpha > 0.1){

                vec3 stars_direction = 10.0 * normalize(vec3(uv * 2.0f - 1.0f, 1.0f)); // could be view vector for example
                float stars_threshold = 12.0 * starDensity; // modifies the number of stars that are visible
                float stars_exposure = 200.0; // modifies the overall strength of the stars
                float stars = pow(clamp(noise(stars_direction * 200.0f), 0.0f, 1.0f), stars_threshold) * stars_exposure;

                retColor += vec3(stars * starAlpha);

            }

			gl_FragColor = vec4( retColor, 1.0 );

			#include <tonemapping_fragment>
			#include <encodings_fragment>

		}`,
};

Sky.CloudsShader = {
    uniforms: {
        iTime: {value: 0.0},
        timeAlpha: {value: 1.0},
        cloudsSpeed: {value: 1},
        cloudsTint: {value: new Color(0xffffff)},
        cloudsAlpha: {value: 1.0},
        cloudsScale: {value: 1.0},
    },

    vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vPosition;
        void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position.z = gl_Position.w;
        }`, 
    
    fragmentShader: /* glsl */ `

    const float clouddark = 0.5;
    const float cloudlight = 0.3;
    const float cloudcover = 0.2;
    const float cloudalpha = 4.0;
    const float skytint = 0.5;

    uniform float iTime;
    uniform float timeAlpha;
    uniform float cloudDensity;
    uniform vec3 cloudsTint;
    uniform float cloudsSpeed;
    uniform float cloudsAlpha;
    uniform float cloudsScale;

    varying vec2 vUv;
    
    const mat2 m = mat2( 1.6,  1.2, -1.2,  1.6 );
    
    vec2 hash( vec2 p ) {
        p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
        return -1.0 + 2.0*fract(sin(p)*43758.5453123);
    }
    
    float noise( in vec2 p ) {
        const float K1 = 0.366025404; // (sqrt(3)-1)/2;
        const float K2 = 0.211324865; // (3-sqrt(3))/6;
        vec2 i = floor(p + (p.x+p.y)*K1);
        vec2 a = p - i + (i.x+i.y)*K2;
        vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0); //vec2 of = 0.5 + 0.5*vec2(sign(a.x-a.y), sign(a.y-a.x));
        vec2 b = a - o + K2;
        vec2 c = a - 1.0 + 2.0*K2;
        vec3 h = max(0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
        vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
        return dot(n, vec3(70.0));
    }
    
    float fbm(vec2 n) {
        float total = 0.0, amplitude = 0.1;
        for (int i = 0; i < 7; i++) {
            total += noise(n) * amplitude;
            n = m * n;
            amplitude *= 0.4;
        }
        return total;
    }
    
    // -----------------------------------------------
    
    void main() {
            float speed = 0.0002 * cloudsSpeed;
            float cloudscale = 10.1 * cloudsScale;
            vec2 p = vUv;
            vec2 uv = vUv;
            vec2 iResolution = vec2(1.0);
            float time = iTime * speed;
            float q = fbm(uv * cloudscale * 0.5);
            
            //ridged noise shape
            float r = 0.0;
            uv *= cloudscale;
            uv -= q - time;
            float weight = 0.8;
            for (int i=0; i<8; i++){
                r += abs(weight*noise( uv ));
                uv = m*uv + time;
                weight *= 0.7;
            }
            
            //noise shape
            float f = 0.0;
            uv = p*vec2(iResolution.x/iResolution.y,1.0);
            uv *= cloudscale;
            uv -= q - time;
            weight = 0.7;
            for (int i=0; i<8; i++){
                f += weight*noise( uv );
                uv = m*uv + time;
                weight *= 0.6;
            }
            
            f *= r + f;
            
            //noise colour
            float c = 0.0;
            time = iTime * speed * 2.0;
            uv = p*vec2(iResolution.x/iResolution.y,1.0);
            uv *= cloudscale*2.0;
            uv -= q - time;
            weight = 0.4;
            for (int i=0; i<7; i++){
                c += weight*noise( uv );
                uv = m*uv + time;
                weight *= 0.6;
            }
            
            //noise ridge colour
            float c1 = 0.0;
            time = iTime * speed * 3.0;
            uv = p*vec2(iResolution.x/iResolution.y,1.0);
            uv *= cloudscale*3.0;
            uv -= q - time;
            weight = 0.4;
            for (int i=0; i<7; i++){
                c1 += abs(weight*noise( uv ));
                uv = m*uv + time;
                weight *= 0.6;
            }
            
            c += c1;
            
            vec3 cloudcolour = vec3(1.1, 1.1, 0.9) * clamp((clouddark + cloudlight*c), 0.0, 1.0);
        
            f = cloudcover + cloudalpha*f*r;
            
            vec3 result = mix(vec3(0.0), clamp(cloudcolour, 0.0, 1.0), clamp(f + c, 0.0, 1.0));

            result *= cloudsTint;
        
            float resultAlpha = result.r;

            result *= timeAlpha;

            gl_FragColor = vec4( result, resultAlpha * cloudsAlpha );

			#include <tonemapping_fragment>
			#include <encodings_fragment>

		}`,
};

export { Sky };

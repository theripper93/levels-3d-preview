export function throttle(fn, delay) {
  let timer = null;
  return function() {
    if (timer === null) {
      timer = setTimeout(() => {
        fn.apply(this, arguments);
        timer = null;
      }, delay);
    }
  };
}
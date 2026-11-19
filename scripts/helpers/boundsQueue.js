const queue = new Set();
let scheduled = false;

function drain(deadline) {
    scheduled = false;
    for (const geometry of queue) {
        if (deadline.timeRemaining() < 4 && !deadline.didTimeout) break;
        queue.delete(geometry);
        if (geometry.boundsTree || !geometry.attributes?.position) continue;
        try {
            geometry.computeBoundsTree();
        } catch (e) {
            console.error(e);
        }
        if (deadline.didTimeout) break;
    }
    schedule();
}

function schedule() {
    if (scheduled || !queue.size) return;
    scheduled = true;
    requestIdleCallback(drain, { timeout: 500 });
}

export function queueBoundsTree(object) {
    object.traverse((child) => {
        if (child.geometry && !child.geometry.boundsTree) queue.add(child.geometry);
    });
    schedule();
}

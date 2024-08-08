const {generateId, createError} = require('./util/util.js');
const {useLock, GenTaskResult, isGenTaskCancelled} = require('./util/concurrent.js');
const {loge} = require('./util/logger.js');

const E = module.exports;

const tasks = {};

const execute = (id, opt={})=>{
    const task = tasks[id];
    if (!task)
        return;
    if (task.shouldStop) {
        task.stop?.();
        delete tasks[id];
        return;
    }
    const {runEvery, skipIfRunning} = opt;
    if (runEvery)
        setTimeout(()=>execute(id, opt), runEvery);
    if (skipIfRunning && task.running)
        return;
    useLock(`timertask/${id}`, async ()=>{
        if (task.shouldStop)
            return;
        task.running = true;
        let taskResult = task.fn.apply(task.handle);
        if (taskResult instanceof GenTaskResult) {
            task.stop = taskResult.stop;
            await taskResult.promise;
            delete task.stop;
        } else {
            await taskResult;
        }
    })
    .catch(e=>{
        if (e.code=='task_cancelled'||isGenTaskCancelled(e))
            return;
        loge(`Timertask ${id} failed`, e);
    })
    .finally(()=>task.running = false);
};

E.submit = (fn, opt={})=>{
    const id = generateId({prefix: 'tt'});
    const task = tasks[id] = {
        id,
        fn,
        running: false,
        shouldStop: false,
    };
    task.handle = {
        exitPoint: ()=>{
            if (task.shouldStop)
                throw createError(`Task ${id} cancelled`, 'task_cancelled');
        },
    };
    execute(id, opt);
    return {
        stop: ()=>{
            task.shouldStop = true;
        },
    };
};

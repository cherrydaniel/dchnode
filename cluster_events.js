const cluster = require('cluster');
const {EventEmitter} = require('events');
const _ = require('lodash');

const ID_SYMBOL = 'ClusterEventEmitter';

const Action = {
    MASTER_EMIT: 'master_emit',
    WORKER_EVENT: 'worker_event',
};

class ClusterEventEmitter {
    #events = new EventEmitter();
    #label;
    constructor(label){
        this.#label = label;
        if (cluster.isPrimary)
            return void this.#initMaster();
        this.#initWorker();
    }
    #initMaster(){
        _.values(cluster.workers)
            .forEach(w=>this.#initSpawnedWorker(w));
        cluster.on('fork', w=>this.#initSpawnedWorker(w));
    }
    #initSpawnedWorker(worker){
        worker.on('message', msg=>{
            if (!this.#shouldHandleMessage(msg))
                return;
            let {action, event, data=[], from} = msg;
            switch (action) {
                case Action.MASTER_EMIT:
                    this.#events.emit(event, ...data);
                    _.values(cluster.workers).filter(w=>w.id!=from).forEach(w=>w.send({
                        sym: ID_SYMBOL,
                        label: this.#label,
                        action: Action.WORKER_EVENT,
                        event,
                        data: args,
                    }));
                    break;
            }
        });
    }
    #initWorker(){
        process.on('message', msg=>{
            if (!this.#shouldHandleMessage(msg))
                return;
            let {action, event, data=[]} = msg;
            switch (action) {
                case Action.WORKER_EVENT:
                    this.#events.emit(event, ...data);
                    break;
            }
        });
    }
    #shouldHandleMessage(msg){
        return _.isObject(msg)&&msg.sym==ID_SYMBOL&&msg.label==this.#label;
    }
    emit(event, ...args){
        this.#events.emit(event, ...args);
        if (cluster.isPrimary) {
            _.values(cluster.workers).forEach(w=>w.send({
                sym: ID_SYMBOL,
                label: this.#label,
                action: Action.WORKER_EVENT,
                event,
                data: args,
            }));
        } else {
            process.send({
                sym: ID_SYMBOL,
                label: this.#label,
                from: cluster.worker.id,
                action: Action.MASTER_EMIT,
                event,
                data: args,
            });
        }
    }
    on(event, cb){ this.#events.on(event, cb); }
    off(event, cb){ this.#events.off(event, cb); }
    once(event, cb){ this.#events.once(event, cb); }
    removeAllListeners(event){ this.#events.removeAllListeners(event); }
    static dispatch(label, event, ...args){
        new ClusterEventEmitter(label).emit(event, ...args);
    }
};

module.exports = {ClusterEventEmitter};

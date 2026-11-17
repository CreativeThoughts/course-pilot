import {parentPort,workerData} from 'node:worker_threads';import {calculate} from './calculate.mjs';parentPort.postMessage(calculate(workerData));

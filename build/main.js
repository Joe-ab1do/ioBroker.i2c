"use strict";
/*
 * Created with @iobroker/create-adapter v1.29.1
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.I2cAdapter = void 0;
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const i2c = require("i2c-bus");
const client_1 = require("./debug/client");
const server_1 = require("./debug/server");
const shared_1 = require("./lib/shared");
class I2cAdapter extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({ dirname: __dirname.indexOf('node_modules') !== -1 ? undefined : __dirname + '/../' }, options), { name: 'i2c' }));
        this.stateChangeListeners = {};
        this.foreignStateChangeListeners = {};
        this.currentStateValues = {};
        this.deviceHandlers = [];
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    get i2cBus() {
        return this.bus;
    }
    addStateChangeListener(id, listener) {
        const key = this.namespace + '.' + id;
        if (!this.stateChangeListeners[key]) {
            this.stateChangeListeners[key] = [];
        }
        this.stateChangeListeners[key].push(listener);
    }
    addForeignStateChangeListener(id, listener) {
        if (!this.foreignStateChangeListeners[id]) {
            this.foreignStateChangeListeners[id] = [];
            this.subscribeForeignStates(id);
        }
        this.foreignStateChangeListeners[id].push(listener);
    }
    setStateAckAsync(id, value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.currentStateValues[this.namespace + '.' + id] = value;
            yield this.setStateAsync(id, value, true);
        });
    }
    getStateValue(id) {
        return this.currentStateValues[this.namespace + '.' + id];
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            const allStates = yield this.getStatesAsync('*');
            for (const id in allStates) {
                if (allStates[id] && allStates[id].ack) {
                    this.currentStateValues[id] = allStates[id].val;
                }
            }
            this.log.info('Using bus number: ' + this.config.busNumber);
            this.bus = yield this.openBusAsync(this.config.busNumber);
            if (this.config.serverPort) {
                this.server = new server_1.I2CServer(this.bus, this.log);
                this.server.start(this.config.serverPort);
            }
            if (!this.config.devices || this.config.devices.length === 0) {
                // no devices configured, nothing to do in this adapter
                return;
            }
            for (let i = 0; i < this.config.devices.length; i++) {
                const deviceConfig = this.config.devices[i];
                if (!deviceConfig.name || !deviceConfig.type) {
                    continue;
                }
                try {
                    const module = yield Promise.resolve().then(() => require(__dirname + '/devices/' + deviceConfig.type.toLowerCase()));
                    const handler = new module.default(deviceConfig, this);
                    this.deviceHandlers.push(handler);
                }
                catch (error) {
                    this.log.error(`Couldn't create ${deviceConfig.type} ${(0, shared_1.toHexString)(deviceConfig.address)}: ${error}`);
                }
            }
            yield Promise.all(this.deviceHandlers.map((h) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield h.startAsync();
                }
                catch (error) {
                    this.log.error(`Couldn't start ${h.type} ${h.hexAddress}: ${error}`);
                }
            })));
            this.subscribeStates('*');
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Here you must clear all timeouts or intervals that may still be active
                if (this.server) {
                    this.server.stop();
                }
                yield Promise.all(this.deviceHandlers.map((h) => h.stopAsync()));
                yield this.bus.close();
                callback();
            }
            catch (e) {
                callback();
            }
        });
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!state) {
                this.log.debug(`State ${id} deleted`);
                return;
            }
            this.log.debug(`stateChange ${id} ${JSON.stringify(state)}`);
            if (this.foreignStateChangeListeners[id]) {
                const listeners = this.foreignStateChangeListeners[id];
                yield Promise.all(listeners.map((listener) => listener(state.val)));
                return;
            }
            if (state.ack) {
                return;
            }
            if (!this.stateChangeListeners[id]) {
                this.log.error('Unsupported state change: ' + id);
                return;
            }
            const listeners = this.stateChangeListeners[id];
            const oldValue = this.currentStateValues[id];
            yield Promise.all(listeners.map((listener) => listener(oldValue, state.val)));
        });
    }
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     */
    onMessage(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.silly('onMessage: ' + JSON.stringify(obj));
            let wait = false;
            if (typeof obj === 'object' && obj.message) {
                switch (obj.command) {
                    case 'search':
                        const res = yield this.searchDevicesAsync(parseInt(obj.message));
                        const result = JSON.stringify(res || []);
                        this.log.debug('Search found: ' + result);
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                        wait = true;
                        break;
                    case 'read':
                        if (typeof obj.message !== 'object' || typeof obj.message.address !== 'number') {
                            this.log.error('Invalid read message');
                            return;
                        }
                        const buf = Buffer.alloc(obj.message.bytes || 1);
                        try {
                            if (typeof obj.message.register === 'number') {
                                yield this.bus.readI2cBlock(obj.message.address, obj.message.register, buf.length, buf);
                            }
                            else {
                                yield this.bus.i2cRead(obj.message.address, buf.length, buf);
                            }
                            if (obj.callback) {
                                this.sendTo(obj.from, obj.command, buf, obj.callback);
                            }
                            wait = true;
                        }
                        catch (e) {
                            this.log.error('Error reading from ' + (0, shared_1.toHexString)(obj.message.address));
                        }
                        break;
                    case 'write':
                        if (typeof obj.message !== 'object' ||
                            typeof obj.message.address !== 'number' ||
                            !Buffer.isBuffer(obj.message.data)) {
                            this.log.error('Invalid write message');
                            return;
                        }
                        try {
                            if (typeof obj.message.register === 'number') {
                                yield this.bus.writeI2cBlock(obj.message.address, obj.message.register, obj.message.data.length, obj.message.data);
                            }
                            else {
                                yield this.bus.i2cWrite(obj.message.address, obj.message.data.length, obj.message.data);
                            }
                            if (obj.callback) {
                                this.sendTo(obj.from, obj.command, obj.message.data, obj.callback);
                            }
                            wait = true;
                        }
                        catch (e) {
                            this.log.error('Error writing to ' + (0, shared_1.toHexString)(obj.message.address));
                        }
                        break;
                    default:
                        this.log.warn('Unknown command: ' + obj.command);
                        break;
                }
            }
            if (!wait && obj.callback) {
                this.sendTo(obj.from, obj.command, obj.message, obj.callback);
            }
        });
    }
    searchDevicesAsync(busNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            if (busNumber === this.config.busNumber) {
                this.log.debug('Searching on current bus ' + busNumber);
                return yield this.bus.scan();
            }
            else {
                this.log.debug('Searching on new bus ' + busNumber);
                const searchBus = yield this.openBusAsync(busNumber);
                const result = yield this.bus.scan();
                yield searchBus.close();
                return result;
            }
        });
    }
    openBusAsync(busNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.config.clientAddress) {
                return new client_1.I2CClient(this.config.clientAddress, this.log);
            }
            else {
                return yield i2c.openPromisified(busNumber);
            }
        });
    }
}
exports.I2cAdapter = I2cAdapter;
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new I2cAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new I2cAdapter())();
}
//# sourceMappingURL=main.js.map
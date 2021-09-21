"use strict";
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
exports.I2CServer = void 0;
const http_1 = require("http");
const url_1 = require("url");
class I2CServer {
    constructor(bus, log) {
        this.bus = bus;
        this.log = log;
        this.server = (0, http_1.createServer)((req, res) => this.handleRequest(req, res));
    }
    start(port) {
        this.log.debug(`RPC Server: listening on port ${port}`);
        this.server.listen(port, 100);
    }
    stop() {
        this.server.close();
    }
    handleRequest(request, response) {
        const reqUrl = `http://${request.headers.host}${request.url}`;
        const parseUrl = (0, url_1.parse)(reqUrl, true);
        const pathname = parseUrl.pathname;
        // we're doing everything json
        response.setHeader('Content-Type', 'application/json');
        // buffer for incoming data
        let buf = null;
        // listen for incoming data
        request.on('data', (data) => {
            if (buf === null) {
                buf = data;
            }
            else {
                buf = buf + data;
            }
        });
        // on end proceed with compute
        request.on('end', () => {
            const body = buf !== null ? buf.toString() : null;
            let compute;
            this.log.debug(`RPC Server: Handling request ${JSON.stringify(parseUrl)}; ${body}`);
            switch (pathname) {
                case '/rpc':
                    compute = this.rpc(body);
                    break;
                default:
                    response.statusCode = 404;
                    response.end(`oops! ${pathname} not found here`);
                    return;
            }
            compute
                .then((res) => {
                this.log.debug('RPC Server: Sending response ' + JSON.stringify(res));
                response.end(JSON.stringify(res));
            })
                .catch((err) => {
                console.error(err);
                response.statusCode = 500;
                response.end('oops! server error: ' + err);
            });
        });
    }
    rpc(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = JSON.parse(body);
            if (!json.method) {
                throw new Error(`Property 'method' is not defined`);
            }
            let buffer;
            switch (json.method) {
                case 'scan':
                    if (json.args && json.args.address) {
                        return yield this.bus.scan(json.args.address);
                    }
                    else if (json.args && json.args.startAddr) {
                        return yield this.bus.scan(json.args.startAddr, json.args.endAddr);
                    }
                    else {
                        return yield this.bus.scan();
                    }
                case 'deviceId':
                    return yield this.bus.deviceId(json.args.address);
                case 'i2cRead':
                    buffer = Buffer.alloc(json.args.length);
                    const i2cRead = yield this.bus.i2cRead(json.args.address, json.args.length, buffer);
                    return { bytesRead: i2cRead.bytesRead, buffer: i2cRead.buffer.toString('hex') };
                case 'i2cWrite':
                    buffer = Buffer.from(json.args.buffer, 'hex');
                    const i2cWrite = yield this.bus.i2cWrite(json.args.address, json.args.length, buffer);
                    return { bytesWritten: i2cWrite.bytesWritten, buffer: i2cWrite.buffer.toString('hex') };
                case 'readByte':
                    return yield this.bus.readByte(json.args.address, json.args.command);
                case 'readWord':
                    return yield this.bus.readWord(json.args.address, json.args.command);
                case 'readI2cBlock':
                    buffer = Buffer.alloc(json.args.length);
                    const readI2cBlock = yield this.bus.readI2cBlock(json.args.address, json.args.command, json.args.length, buffer);
                    return { bytesRead: readI2cBlock.bytesRead, buffer: readI2cBlock.buffer.toString('hex') };
                case 'receiveByte':
                    return yield this.bus.receiveByte(json.args.address);
                case 'sendByte':
                    yield this.bus.sendByte(json.args.address, json.args.byte);
                    return {}; // prefer an empty object to void
                case 'writeByte':
                    yield this.bus.writeByte(json.args.address, json.args.command, json.args.byte);
                    return {}; // prefer an empty object to void
                case 'writeWord':
                    yield this.bus.writeWord(json.args.address, json.args.command, json.args.word);
                    return {}; // prefer an empty object to void
                case 'writeQuick':
                    yield this.bus.writeQuick(json.args.address, json.args.command, json.args.bit);
                    return {}; // prefer an empty object to void
                case 'writeI2cBlock':
                    buffer = Buffer.from(json.args.buffer, 'hex');
                    const writeI2cBlock = yield this.bus.writeI2cBlock(json.args.address, json.args.command, json.args.length, buffer);
                    return { bytesRead: writeI2cBlock.bytesWritten, buffer: writeI2cBlock.buffer.toString('hex') };
                default:
                    throw new Error(`Property 'method' is unknown: ${json.method}`);
            }
        });
    }
}
exports.I2CServer = I2CServer;
//# sourceMappingURL=server.js.map
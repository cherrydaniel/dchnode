const {WebSocket} = require('ws');
const {loge} = require('./util/logger.js');

function WebSocketHandle(data = {url, persistent, onOpen, onMessage, onError, onClose, retryTime}) {
    this._data = data;
    this.create();
	return this;
}

WebSocketHandle.prototype.create = function() {
    const {url, persistent, onOpen, onMessage, onError, onClose, retryTime} = this._data;

	this._ws = new WebSocket(url);

	if (onOpen)
        this._ws.on('open', () => onOpen.call(this));

	if (onMessage) {
        this._ws.on('message', data => {
            let parsedData = String(data);
            try {
                parsedData = JSON.parse(parsedData);
            } catch (ignored) {}
            onMessage.call(this, parsedData);
        });
    }

	if (onError)
        this._ws.on('error', e => onError.call(this, e));

    this._ws.on('close', (code, reason) => {
        if (onClose) onClose.call(this, code, reason);
        if (code === 1000) return;
        if (persistent) {
            loge(`Connection error to WebSocket ${url}. Retrying in ${retryTime || 3000} ms...`);
            setTimeout(() => this.create(), retryTime || 3000);
        }
    });

}

WebSocketHandle.prototype.send = function(msg) {
	if (!this._ws || !msg || this._ws.readyState !== 1) return false;
	if (typeof msg === 'object')
		msg = JSON.stringify(msg);
	if (typeof msg !== 'string')
		msg = String(msg);
	this._ws.send(msg);
	return true;
}

WebSocketHandle.prototype.close = function() {
	if (!this._ws) return false;
	this._ws.close(1000);
	return true;
}

WebSocketHandle.prototype.reload = function(url = null) {
	this.close();
	if (url) this._data.url = url;
	this.create();
}

module.exports = {WebSocketHandle};

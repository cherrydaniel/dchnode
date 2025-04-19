
const E = module.exports;

class PacketWriter {
    #buf;
    constructor(buf){ this.#buf = buf||Buffer.alloc(0); }
    get length(){ return this.#buf.length; }
    #write(method, size, val){
        let b = Buffer.alloc(size);
        b[method](val);
        this.#buf = Buffer.concat([this.#buf, b]);
        return this;
    }
    writeString(val){
        this.#buf = Buffer.concat([this.#buf, Buffer.from(val)]);
        return this;
    }
    writeBigUInt64LE(val){ return this.#write('writeBigUInt64LE', 8, val); }
    writeBigUInt64BE(val){ return this.#write('writeBigUInt64BE', 8, val); }
    writeBigInt64LE(val){ return this.#write('writeBigInt64LE', 8, val); }
    writeBigInt64BE(val){ return this.#write('writeBigInt64BE', 8, val); }
    writeUInt32LE(val){ return this.#write('writeUInt32LE', 4, val); }
    writeUInt32BE(val){ return this.#write('writeUInt32BE', 4, val); }
    writeInt32LE(val){ return this.#write('writeInt32LE', 4, val); }
    writeInt32BE(val){ return this.#write('writeInt32BE', 4, val); }
    writeUInt16LE(val){ return this.#write('writeUInt16LE', 2, val); }
    writeUInt16BE(val){ return this.#write('writeUInt16BE', 2, val); }
    writeInt16LE(val){ return this.#write('writeInt16LE', 2, val); }
    writeInt16BE(val){ return this.#write('writeInt16BE', 2, val); }
    writeUInt8(val){ return this.#write('writeUInt8', 1, val); }
    writeInt8(val){ return this.#write('writeInt8', 1, val); }
    toBuffer() { return this.#buf; }
}

class PacketReader {
    #buf; #idx = 0;
    constructor(buf){ this.#buf = buf; }
    get length(){ return this.#buf.length; }
    get bytesRead(){ return this.#idx; }
    get bytesRemaining(){ return this.#buf.length-this.#idx; }
    #read(method, size){
        let res = this.#buf[method](this.#idx);
        this.#idx+=size;
        return res;
    }
    readString(size){
        let res = this.#buf.subarray(this.#idx, this.#idx+size).toString();
        this.#idx+=size;
        return res;
    }
    readBigUInt64LE(){ return this.#read('readBigUInt64LE', 8); }
    readBigUInt64BE(){ return this.#read('readBigUInt64BE', 8); }
    readBigInt64LE(){ return this.#read('readBigInt64LE', 8); }
    readBigInt64BE(){ return this.#read('readBigInt64BE', 8); }
    readUInt32LE(){ return this.#read('readUInt32LE', 4); }
    readUInt32BE(){ return this.#read('readUInt32BE', 4); }
    readInt32LE(){ return this.#read('readInt32LE', 4); }
    readInt32BE(){ return this.#read('readInt32BE', 4); }
    readUInt16LE(){ return this.#read('readUInt16LE', 2); }
    readUInt16BE(){ return this.#read('readUInt16BE', 2); }
    readInt16LE(){ return this.#read('readInt16LE', 2); }
    readInt16BE(){ return this.#read('readInt16BE', 2); }
    readUInt8(){ return this.#read('readUInt8', 1); }
    readInt8(){ return this.#read('readInt8', 1); }
}

E.writePacket = buf=>new PacketWriter(buf);

E.readPacket = data=>new PacketReader(data);

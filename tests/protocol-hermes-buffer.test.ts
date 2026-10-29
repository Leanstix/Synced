import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
vi.mock('buffer', async()=>{
 const {createRequire}=await import('node:module');
 return createRequire(import.meta.url)('buffer/');
});
import {Buffer} from 'buffer';
import {encodeFrame, FrameDecoder, MAX_FRAME_BYTES} from '../src/core/protocol';
const original=Buffer.prototype.subarray;
beforeAll(()=>{
 // Hermes can return a plain TypedArray from a Buffer's inherited subarray.
 Buffer.prototype.subarray=function(this: Buffer,start?:number,end?:number){
  return new Uint8Array(this.buffer,this.byteOffset,this.byteLength).subarray(start,end);
 } as typeof original;
});
afterAll(()=>{Buffer.prototype.subarray=original;});
describe('Hermes Buffer frame decoding',()=>{
 it('decodes a complete frame without relying on Buffer subarray inheritance',()=>{
  const frame=encodeFrame({type:'hello',version:1});
  expect(Buffer.isBuffer(frame.subarray(4))).toBe(false);
  expect(new FrameDecoder().push(frame)).toEqual([{type:'hello',version:1}]);
 });
 it('accepts a header arriving one byte at a time',()=>{
  const frame=encodeFrame({type:'hello'}),decoder=new FrameDecoder();
  for(let i=0;i<4;i++)expect(decoder.push(frame.subarray(i,i+1))).toEqual([]);
  expect(decoder.push(frame.subarray(4))).toEqual([{type:'hello'}]);
 });
 it('preserves Unicode text across split UTF-8 body bytes',()=>{
  const value={text:'Ẹ káàbọ̀ 👋'},frame=encodeFrame(value),decoder=new FrameDecoder(),result:unknown[]=[];
  for(const byte of frame)result.push(...decoder.push(new Uint8Array([byte])));
  expect(result).toEqual([value]);
 });
 it('decodes coalesced handshake and encrypted frames',()=>{
  const a={type:'hello'},b={type:'encrypted',sequence:0,ciphertext:'sample'};
  expect(new FrameDecoder().push(Buffer.concat([encodeFrame(a),encodeFrame(b)]))).toEqual([a,b]);
 });
 it('retains an incomplete next frame after a complete first frame',()=>{
  const a=encodeFrame({one:1}),b=encodeFrame({two:2}),decoder=new FrameDecoder();
  expect(decoder.push(Buffer.concat([a,Buffer.from(b.subarray(0,6))]))).toEqual([{one:1}]);
  expect(decoder.push(b.subarray(6))).toEqual([{two:2}]);
 });
 it('accepts a plain Uint8Array transport chunk',()=>{
  expect(new FrameDecoder().push(new Uint8Array(encodeFrame({type:'proof'})))).toEqual([{type:'proof'}]);
 });
 it('continues to reject invalid JSON instead of accepting comma-separated byte values',()=>{
  const body=Buffer.from('not-json'),header=Buffer.alloc(4);header.writeUInt32BE(body.length);
  expect(()=>new FrameDecoder().push(Buffer.concat([header,body]))).toThrow();
 });
 it('continues to enforce the frame size boundary',()=>{
  const header=Buffer.alloc(4);header.writeUInt32BE(MAX_FRAME_BYTES+1);
  expect(()=>new FrameDecoder().push(header)).toThrow('Invalid frame length');
 });
});

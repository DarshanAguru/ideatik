import { Buffer } from 'buffer';

function findDataChunkOffsetAndSize(fileBuffer: Buffer): { offset: number; size: number } | null {
  if (fileBuffer.length < 12) return null;
  
  // Verify RIFF & WAVE headers
  const riff = fileBuffer.toString('ascii', 0, 4);
  const wave = fileBuffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= fileBuffer.length) {
    const chunkId = fileBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = fileBuffer.readUInt32LE(offset + 4);
    
    if (chunkId === 'data') {
      return {
        offset: offset + 8,
        size: chunkSize
      };
    }
    
    offset += 8 + chunkSize;
  }
  
  return null;
}

// Test 1: Standard 44-byte WAV header
const stdBuffer = Buffer.alloc(100);
stdBuffer.write('RIFF', 0);
stdBuffer.writeUInt32LE(92, 4);
stdBuffer.write('WAVE', 8);
stdBuffer.write('fmt ', 12);
stdBuffer.writeUInt32LE(16, 16);
stdBuffer.writeUInt16LE(1, 20); // PCM
stdBuffer.writeUInt16LE(1, 22); // Mono
stdBuffer.writeUInt32LE(16000, 24);
stdBuffer.writeUInt32LE(32000, 28);
stdBuffer.writeUInt16LE(2, 32);
stdBuffer.writeUInt16LE(16, 34);
stdBuffer.write('data', 36);
stdBuffer.writeUInt32LE(56, 40);

const result1 = findDataChunkOffsetAndSize(stdBuffer);
console.log('Test 1 (Standard):', result1);
if (result1 && result1.offset === 44 && result1.size === 56) {
  console.log('Test 1 Passed!');
} else {
  console.error('Test 1 Failed!');
}

// Test 2: WAV with extra metadata LIST chunk before data chunk
const metaBuffer = Buffer.alloc(120);
metaBuffer.write('RIFF', 0);
metaBuffer.writeUInt32LE(112, 4);
metaBuffer.write('WAVE', 8);
metaBuffer.write('fmt ', 12);
metaBuffer.writeUInt32LE(16, 16);
metaBuffer.writeUInt16LE(1, 20); // PCM
metaBuffer.writeUInt16LE(1, 22); // Mono
metaBuffer.writeUInt32LE(16000, 24);
metaBuffer.writeUInt32LE(32000, 28);
metaBuffer.writeUInt16LE(2, 32);
metaBuffer.writeUInt16LE(16, 34);
// LIST chunk starting at offset 36
metaBuffer.write('LIST', 36);
metaBuffer.writeUInt32LE(12, 40); // List size 12
// Data chunk starting at offset 36 + 8 + 12 = 56
metaBuffer.write('data', 56);
metaBuffer.writeUInt32LE(56, 60);

const result2 = findDataChunkOffsetAndSize(metaBuffer);
console.log('Test 2 (Extra LIST chunk):', result2);
if (result2 && result2.offset === 64 && result2.size === 56) {
  console.log('Test 2 Passed!');
} else {
  console.error('Test 2 Failed!');
}

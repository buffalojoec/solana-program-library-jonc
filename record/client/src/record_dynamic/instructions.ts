
import { PublicKey, Connection, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { deserializeUnchecked, serialize, Schema } from 'borsh';
import '../utils/borsh_ext' // extend borsh with pubkey
import {
    RecordInstruction,
} from '../record/instructions';
import {
    RECORD_SCHEMA,
  } from '../record/schema';
const _debug = false;


/// Instruction Arguments Dynamic Record Data
export class InitializeDynamicArgs {
    instruction: RecordInstruction = RecordInstruction.InitializeDynamic;
}

export class WriteDynamicArgs {
    instruction: RecordInstruction = RecordInstruction.WriteDynamic;
    offset: BN;
    data_len: number;
    data: Buffer;

    constructor(args: { offset: BN, data_len: number, data: Buffer; }) {
        this.offset = args.offset;
        this.data_len = args.data_len;
        this.data = args.data;
    }
}

/// Instructions  -----------------------------------------------------
//
//ah nice, you have the instruction creators here

/// Instruction: Record program: Initialize
export function initializeDynamicInstruction(
    account: PublicKey,
    authority: PublicKey,
    programId: PublicKey,
  ): TransactionInstruction {
    if (_debug) { console.log(`\nInstruction: InitializeDyanmic`); }

    // Account keys
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ]

    // Define instruction arguments
    const args = new InitializeDynamicArgs();
    const data = Buffer.from(serialize(RECORD_SCHEMA, args))

    // Build return instruction
    return new TransactionInstruction({
      keys,       // accounts
      programId,  // program address (id)
      data        // data - instruction only, in this case
    })
  };

  /// Instruction: Record program: Write
  export function writeDynamicInstruction(
    account: PublicKey,
    authority: PublicKey,
    offset: BN,
    data: Buffer,
    programId: PublicKey,
  ): TransactionInstruction {
    if (_debug) { console.log(`\nInstruction: Record Write`); }

    // Account Keys
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ];

    // Define instruction arguments
    const args = new WriteDynamicArgs({
      offset,
      data_len: data.length,
      data: data,
    });

    if (_debug) {
      console.log(`\ndata: `, data, '\n');
      console.log(`\nWriteArgs: `, args, `\n`);
    }

    // Serialize data
    const ser_data = Buffer.from(serialize(RECORD_SCHEMA, args));

    if (_debug) {
      console.log(`\nser_data: \n`, ser_data, `\nlength:`, ser_data.length);
      console.log(`\nBuffer.from(data): `, data, `\n`);
      console.log(`\ndata.length: `, data.length);
      console.log(`\ndata.length BN: `, new BN(data.length).toBuffer());
    }

    return new TransactionInstruction({
      keys,               // accounts
      programId,          // program address (id)
      data: ser_data, // serialized data
    });
  };


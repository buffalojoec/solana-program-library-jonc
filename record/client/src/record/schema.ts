import {
  InitializeArgs,
  WriteArgs,
  SetAuthorityArgs,
  CloseAccountArgs,
} from './instructions';

import {
  InitializeDynamicArgs,
  WriteDynamicArgs,
} from '../record_dynamic/instructions';

import { RecordData } from './models';

// DEFINE META DATA : FOR TRANSACTION INSTRUCTIONS, & GETs | SERIALIZE & DESERIALIZE
// Define all objects for serializing and deserializing to/from program
//
// I'm surprised that you were able to do this without any `enum` types from Borsh.
// Are they totally unusable now? I remember them being helpful for instructions.
//
// Also, I'm not sure if you're planning on writing a tutorial to go along with this,
// but this schema should be *very* easy to find!
export const RECORD_SCHEMA = new Map<any, any>([
  [
    InitializeArgs, // -> serialize as instruction data
    {
      kind: 'struct',
      fields: [['instruction', 'u8']],
    },
  ],
  [
    WriteArgs,    // -> serialize as instruction data
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['offset', 'u64'],
          ['data', 'string'],     // borsh adds length automatically ~ notes
                                  // if string + 32
                                  // if using fixed size [32]
                                  // add length manually before
                                  // ['data_len', 'u32'],
                                  // ['data', [32]],
        ],
      },
  ],
  [
    SetAuthorityArgs, // -> serialize as instruction data
    {
      kind: 'struct',
      fields: [['instruction', 'u8']],
    },
  ],
  [
    CloseAccountArgs, // -> serialize as instruction data
    {
      kind: 'struct',
      fields: [['instruction', 'u8']],
    },
  ],
  [
    RecordData,     // deserialize -> as account data
    {
      kind: 'struct',
      fields: [
        ['version', 'u8'],
        ['authority', 'pubkey'],
        ['data', [32]],           // fixed size
      ],
    },
  ],
  [
    InitializeDynamicArgs, // -> serialize as instruction data
    {
      kind: 'struct',
      fields: [['instruction', 'u8']],
    },
  ],
  [
    WriteDynamicArgs,    // -> serialize as instruction data
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['offset', 'u64'],
          ['data', 'string'],
        ],
      },
  ],
]);

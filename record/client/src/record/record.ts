/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

//nit: this filename could be a bit clearer, maybe something like "actions" since it's
//defining actions to take on the record?
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  ParsedConfirmedTransaction,
  AccountInfo,
  Signer,
  Keypair,
} from '@solana/web3.js';

import BN from 'bn.js';
import assert from 'assert';
import { deserializeUnchecked, serialize, Schema } from 'borsh';
import '../utils/borsh_ext'
import * as ConsoleUtils from '../utils/console';

import {
  deepStrictEqualBN,
  getAccountWithSeed,
  printTransactionURL,
  getParsedTransaction,
} from '../utils/utils';

import {
  InitializeArgs,
  WriteArgs,
  SetAuthorityArgs,
  CloseAccountArgs,
} from './instructions';
import { RecordData, Data } from './models';
import { RECORD_SCHEMA } from './schema';

const _debug = true; // flag

// Account Seeds
export function getAccountSeed(seed: string, unique?: boolean) {
  return seed += unique ? Date.now().toString(): '';
};

export const ACCOUNT_SEED = getAccountSeed('spl_record_program');
if (_debug) {console.log(`\nACCOUNT_SEED: `, ACCOUNT_SEED);}

// Account header size.
const HEADER_LENGTH = 33;

// Account Size
export function getRecordDataAccountSizeDefault() {
  return new RecordData({
      version: 0,
      authority: new PublicKey(Buffer.alloc(32)),
      data: Buffer.alloc(32),
  });
};

export const RECORD_ACCOUNT_SIZE = serialize(RECORD_SCHEMA, getRecordDataAccountSizeDefault()).length;
if (_debug) {console.log(`\nrecord: RECORD_ACCOUNT_SIZE: ${RECORD_ACCOUNT_SIZE} \n`);}

/// Create Record Account (Create, Initialize, and first Write)
export async function create(
  data: Data,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  seed: string,
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, RecordData | null]> {
  if (_debug) { console.log(`\nAttempting to CREATE Record Account...\n`); }

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    seed,
    programId,
    connection)

  // storage for updated account
  let accountUpdated: AccountInfo<Buffer> | null = null;

  // check account exists
  if (account === null) {
    if (_debug) {
      console.log('Creating NEW Record Account: ', accountPublicKey.toBase58());
      console.log(`Creating Transaction: Record program:
                \nInstructions: Create, Initialize, 1st Write`);
    }

    // Rent calculation
    const lamports = await connection.getMinimumBalanceForRentExemption(
      RECORD_ACCOUNT_SIZE,
    );

    // Build Transaction
    const transaction = new Transaction().add(

      // Instruction: Create Account
      SystemProgram.createAccountWithSeed({
        fromPubkey: payerPublicKey,
        basePubkey: authorityPublicKey,
        seed: seed!,
        newAccountPubkey: accountPublicKey,
        lamports,
        space: RECORD_ACCOUNT_SIZE!,
        programId,
      }),

      // Instruction: Initialize Account
      initializeInstruction(
        accountPublicKey,
        authorityPublicKey,
        programId),

      // Instruction: Write
      writeInstruction(
        accountPublicKey,
        authorityPublicKey,
        new BN(data.offset),   // offset (u64, as BN)
        data.data,             // test data (u8; 32, as [32] array, alt 'string')
        programId)
    );

    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...\n`);
    }

    const txid = await sendAndConfirmTransaction(
      connection,
      transaction,
      [...signers]
    );

    // print transaction url -
    printTransactionURL(txid, connection); // prints transaction url to console

    if (_debug) { await getParsedTransaction(txid, connection);}
    if (_debug) {console.log(`\nGetting new account info...`);}

    // Get Account Info
    accountUpdated = await connection.getAccountInfo(accountPublicKey);
    if (accountUpdated !== null) {
      if (_debug) {
        console.log(`Updated Account Details: ${accountPublicKey}: \n`, accountUpdated, '\n');
        console.log(`\nDecoding new account info...`);
        console.log(`\nraw record data: `, accountUpdated!.data);
      }

      const recordDataUpdated = decodeRecordAccountData(accountUpdated!.data);

      if (_debug) {
        console.log(`\ndecoded recordData: `, accountUpdated);

        VerboseAccountLogging(
          payerPublicKey,
          authorityPublicKey,
          accountUpdated,
          data,
          recordDataUpdated);

        console.log(`\nPerforming validation tests...`);
        assert.strictEqual(data.data, recordDataUpdated?.dataFormatted);
        deepStrictEqualBN(authorityPublicKey, recordDataUpdated?.authority);

        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                    '-> Create Record: Tests successfully passed!');
      }
      return [accountPublicKey, recordDataUpdated];

    } else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
    }
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_YELLOW_PREP}`,
                  `-> Account already exists:: ${accountPublicKey}  \n`);
  }
  return [accountPublicKey, null];  // if null account already exists
};

/// Update Record Account
export async function update(
  data: Data,
  accountPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<RecordData | null> {

  if (_debug) {
    console.log(`\nAttempting to UPDATE a Record Account...`);
    console.log(`\nChecking if Record Account already exists: ${accountPublicKey} ...`)
  }
  const account = await connection.getAccountInfo(accountPublicKey);

  let accountUpdated: AccountInfo<Buffer> | null = null;  // storage for updated account

  // Only try to update a valid account
  if (account !== null) {
    if (_debug) {
      console.log(`\nUpdating Record Account: ${accountPublicKey} ...`);
      console.log(`\nCreating Transaction: Record program:
                  \nInstructions: Write`);
    }

    // Create Transaction. Add Instructions.
    const transaction = new Transaction().add(

      // Instruction: Write
      writeInstruction(
        accountPublicKey,
        authorityPublicKey,
        new BN(data.offset),      // offset (u64, as BN)
        data.data,                // test data (u8; 32, as 'string')
        programId)
    );

    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...`);
    }
    const txid = await sendAndConfirmTransaction(connection, transaction, [...signers]);
    printTransactionURL(txid, connection);

    if (_debug) { await getParsedTransaction(txid, connection);}
    if (_debug) {console.log(`\nGetting new account info...`);}

    accountUpdated = await connection.getAccountInfo(accountPublicKey);

    if (accountUpdated !== null) {
      if (_debug) {console.log(`Updated Account Details: ${accountPublicKey}: \n`, accountUpdated, '\n');}

      const recordDataUpdated = decodeRecordAccountData(accountUpdated!.data);

      if (_debug) {
        VerboseAccountLogging(
          signers[0].publicKey,   // first signer is payer
          authorityPublicKey,
          accountUpdated,
          data,
          recordDataUpdated
        );

        console.log(`\nPerforming validation tests...`);
        assert.strictEqual(data.data, recordDataUpdated?.dataFormatted);
        deepStrictEqualBN(authorityPublicKey, recordDataUpdated!.authority);
        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                    '-> Update Record: Tests successfully passed!');
      }
      return recordDataUpdated;
    }
    else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
    }
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
  }
  return null;  // could not find account
};

/// Update Record Account
export async function setAuthority(
  accountPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  newAuthorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<RecordData | null> {

  if (_debug) {
    console.log(`\nAttempting to SET AUTHORITY on a Record Account...`);
    console.log(`\nChecking if Record Account already exists: ${accountPublicKey} ...`)
  }
  const account = await connection.getAccountInfo(accountPublicKey);

  let accountUpdated: AccountInfo<Buffer> | null = null;  // storage for updated account

  // Only try to update a valid account
  if (account !== null) {
    if (_debug) {
      console.log(`\nUpdating Record Account: ${accountPublicKey} ...`);
      console.log(`\nCreating Transaction: Record program:
                  \nInstructions: Write`);
    }

    // Create Transaction. Add Instructions.
    const transaction = new Transaction().add(

      // Instruction: Write
      setAuthorityInstruction(
        accountPublicKey,
        authorityPublicKey,
        newAuthorityPublicKey,      // offset (u64, as BN)
        programId)
    );

    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...`);
    }
    const txid = await sendAndConfirmTransaction(connection, transaction, [...signers]);
    printTransactionURL(txid, connection);

    if (_debug) { await getParsedTransaction(txid, connection);}
    if (_debug) {console.log(`\nGetting new account info...`);}

    accountUpdated = await connection.getAccountInfo(accountPublicKey);

    if (accountUpdated !== null) {
      if (_debug) {console.log(`Updated Account Details: ${accountPublicKey}: \n`, accountUpdated, '\n');}

      const recordDataUpdated = decodeRecordAccountData(accountUpdated!.data);

      if (_debug) {
        VerboseAccountLogging(
          signers[0].publicKey,   // first signer is payer
          authorityPublicKey,
          accountUpdated,
          null,
          recordDataUpdated
        );

        assert.notStrictEqual(authorityPublicKey.toString(), recordDataUpdated!.authority.toString());
        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                    '-> Update Record: Tests successfully passed!');
      }
      return recordDataUpdated;
    }
    else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
    }
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
  }
  return null;  // could not find account
};

/// Update Record Account
export async function closeAccount(
  accountPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  destinationPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<Boolean> {

  if (_debug) {
    console.log(`\nAttempting to UPDATE a Record Account...`);
    console.log(`\nChecking if Record Account already exists: ${accountPublicKey} ...`)
  }
  const account = await connection.getAccountInfo(accountPublicKey);

  let accountUpdated: AccountInfo<Buffer> | null = null;  // storage for updated account

  // Only try to close a valid account
  if (account !== null) {
    if (_debug) {
      console.log(`\nUpdating Record Account: ${accountPublicKey} ...`);
      console.log(`\nCreating Transaction: Record program:
                  \nInstructions: Write`);
    }

    // Create Transaction. Add Instructions.
    const transaction = new Transaction().add(

      // Instruction: Write
      closeAccountInstruction(
        accountPublicKey,       // account to close
        authorityPublicKey,     // authority on account
        destinationPublicKey,   // where to send remaining balance
        programId)              //
    );

    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...`);
    }
    const txid = await sendAndConfirmTransaction(connection, transaction, [...signers]);
    printTransactionURL(txid, connection);

    if (_debug) { await getParsedTransaction(txid, connection);}
    if (_debug) {console.log(`\nGetting new account info...`);}

    accountUpdated = await connection.getAccountInfo(accountPublicKey);

    // account should be null if closed?
    if (accountUpdated === null) {
      if (_debug) {
        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                      '-> Update Record: Tests successfully passed!');
      }
      return true;
    }

  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
  }
  console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not closed: ${accountPublicKey}  \n`);
  return false;  // could not find account
};

/// Instructions Implementation: -------------------------------

/// Instruction: Record program: Initialize
export function initializeInstruction(
    account: PublicKey,
    authority: PublicKey,
    programId: PublicKey,
): TransactionInstruction {
  if (_debug) { console.log(`\nInstruction: Initialize`); }

  // Account keys
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ]

  // Define instruction arguments
  const args = new InitializeArgs()
  const data = Buffer.from(serialize(RECORD_SCHEMA, args))

  // Build return instruction
  return new TransactionInstruction({
    keys,       // accounts
    programId,  // program address (id)
    data        // data - instruction only, in this case
  })
};

/// Instruction: Record program: Write
export function writeInstruction(
  account: PublicKey,
  authority: PublicKey,
  offset: BN,
  data: String,
  programId: PublicKey,
): TransactionInstruction {
  if (_debug) { console.log(`\nInstruction: Record Write`); }

  // Account Keys
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  // Define instruction arguments
  const args = new WriteArgs({
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
    keys,           // accounts
    programId,      // program address (id)
    data: ser_data, // serialized data
  });
};

/// Instruction: Record Program: Set Authority Account
export function setAuthorityInstruction(
  account: PublicKey,
  authority: PublicKey,
  newAuthority: PublicKey,
  programId: PublicKey,
): TransactionInstruction {
  if (_debug) { console.log(`\nInstruction: Set Authority`); }

  // Account Keys
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: newAuthority, isSigner: false, isWritable: true },
  ];

  // Define instruction arguments
  const args = new SetAuthorityArgs()
  const data = Buffer.from(serialize(RECORD_SCHEMA, args))

  // Build return instruction
  return new TransactionInstruction({
    keys,       // accounts
    programId,  // program address (id)
    data        // data - instruction only, in this case
  })
};

/// Instruction: Record Program: Close Account
export function closeAccountInstruction(
  account: PublicKey,
  authority: PublicKey,
  destination: PublicKey,
  programId: PublicKey,
): TransactionInstruction {
  if (_debug) { console.log(`\nInstruction: Close Account`); }

  // Account Keys
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: destination, isSigner: false, isWritable: true },
  ];

  // Define instruction arguments
  const args = new CloseAccountArgs()
  const data = Buffer.from(serialize(RECORD_SCHEMA, args))

  // Build return instruction
  return new TransactionInstruction({
    keys,       // accounts
    programId,  // program address (id)
    data        // data - instruction only, in this case
  })
};

// Utilities: ------------------------------------------
// nit: these could be added to schema.ts

/// Decode Record Account Data
export const decodeRecordAccountData = (buffer: Buffer): RecordData => {
  if (_debug) { console.log(`\ndecodeRecordAccountData: `, buffer, `\n`); }
  const recordData = deserializeUnchecked(      // borsh + added extension for 'pubkey' borsh_ext.ts
      RECORD_SCHEMA,
      RecordData,
      buffer,
  ) as RecordData;
  return recordData;
};

/// Utility
export function getDefaultRecordData() {
  return new RecordData({
    version: 0,
    authority: new PublicKey(Buffer.alloc(32)),
    data: Buffer.alloc(32),
  });
};


// -------------------------------------------------------
// MISC: VERBOSE LOGGING ~ test chunk output
function VerboseAccountLogging(
  payer: PublicKey,
  authority: PublicKey,
  account?: AccountInfo<Buffer> | null,
  beforeData?: Data | null,
  AfterRecordData?: RecordData,
) {
  if (account !== null) {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_YELLOW_PREP}`, `Verbose Logging Results...`);
    console.log(`\nraw data: `, AfterRecordData?.data);
    console.log(`\nraw buffer data: `, AfterRecordData?.data);
    console.log(`\nformatted data: `, AfterRecordData?.dataFormatted);
    console.log(`\nbuffer data: `, AfterRecordData?.data);

    console.log(`\npayer: ${payer}`,
                `\naccount owner: ${account?.owner}`,
                `\nauthority: ${payer}`);

    // Examples: alts to print a public key ~ how many ways
    // console.log(`\nauthority raw data: `, recordData!.authority);
    // console.log(`\nauthority formatted $: ${recordData!.authority}`);
    // console.log(`\nauthority toBase58(): `, recordData!.authority.toBase58());
    console.log(`\nauthority toString(): `, AfterRecordData!.authority.toString());

    // Validate some data:
    console.log(`\nAuthority Compare:`,
                `\nBefore: `, payer.toBase58(),
                `\nAfter : `, AfterRecordData?.authority!.toBase58());

    console.log(`\nData Compare:`,
                `\nBefore: `, beforeData?.data,
                `\nAfter : `, AfterRecordData?.dataFormatted);
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_YELLOW_PREP} \n`, `...End of Verbose Logging`);
  }
};

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

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
  getAccountWithSeed,
  printTransactionURL,
  getParsedTransaction,
} from '../utils/utils';

import { 
  SimpleRecord, 
  MetaData, 
  HEADER_LENGTH 
} from "./models";

import { 
  initializeDynamicInstruction, 
  writeDynamicInstruction,   
} from "./instructions";

const _debug = false; // flag

// Account Seeds
export function getAccountSeed(seed: string, unique?: boolean) {
  return seed + unique ? Date.now().toString(): null;
};

export const ACCOUNT_DYNAMIC_SEED = getAccountSeed('spl_record_dynamic_program');
if (_debug) {console.log(`\nACCOUNT_DYNAMIC_SEED: `, ACCOUNT_DYNAMIC_SEED);}

// ACCOUNT SIZE - for dynamic size with max allowance
export const ACCOUNT_MAX_SIZE = 150;  // for dynamic data, up to max size account data
                                      // currently unable to change account size after initial account
                                      // allocation, set this to the max size estimated for account
if (_debug) {console.log(`\nRecord: ACCOUNT_MAX_SIZE: ${ACCOUNT_MAX_SIZE} \n`);}

// TODO: dynamic get a size
export async function GetAccountInstanceSize(schema: any, instance: any): Promise<number | null> {  
  console.log(`\nGetAccountInstanceSize: `, schema, instance);
  return serialize(schema, instance).length;
}



/// Method Implementations  --------------------------------------------

/// Dynamic Record Account Implementation Methods:
/// Create Dynamic Record Account (Create, Initialize, and first Write)
/// Dynamic applies to the data itself, which may vary by size and type
/// The basic idea of dynamic record storage is to act like a generic store,
/// it should not care what is stored. 
/// The client knows, by key, what to expect.
/// The client will deserialize according to what is expected
/// The account key is created with a seed
/// Record contains, owner, authority, version, and data (most anything)
export async function createSimple(
  data: SimpleRecord,            // passing type specific
  offset: number = 0,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {
  if (_debug) { console.log(`\nAttempting to CREATE a DYNAMIC Record Account...\n`); } 

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    ACCOUNT_DYNAMIC_SEED!,
    programId,
    connection)
  
  // check account exists
  if (account === null) {
    if (_debug) {
      console.log('Creating NEW DYNAMIC Record Account: ', accountPublicKey.toBase58());
      console.log(`Creating Transaction: Record program:
                \nInstructions: Create, Initialize, 1st Write`);
    }

    // Rent calculation
    const lamports = await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_MAX_SIZE,
    );
    
    let dynamicRecordSerialized = serialize(
      SimpleRecord.schema,
      data,
    );    

    console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
    console.log(`dynamicRecordSerialized key: `, new PublicKey(data.key).toBase58());

    // TODO: Build Transaction
    const transaction = new Transaction().add(

      // TODO: Instruction: Create Account 
      SystemProgram.createAccountWithSeed({
        fromPubkey: payerPublicKey,           // 
        basePubkey: authorityPublicKey,       //
        seed: ACCOUNT_DYNAMIC_SEED!,          // this could be anything 
        newAccountPubkey: accountPublicKey,   // 
        lamports,                             // rent cost
        space: ACCOUNT_MAX_SIZE!,             // max size account will ever be
        programId,
      }),

      // TODO: Instruction: Initialize Account Dynamic
      initializeDynamicInstruction(
        accountPublicKey,
        authorityPublicKey,
        programId),

      // TODO: Instruction: WriteDynamic
      writeDynamicInstruction(
        accountPublicKey, 
        authorityPublicKey,        
        new BN(offset),
        Buffer.from(dynamicRecordSerialized),
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
    printTransactionURL(txid, connection); // prints transaction url to console

    if (_debug) { await getParsedTransaction(txid, connection);}            
    if (_debug) {console.log(`\nGetting new account info...`);}

    // Get Account Info    
    const accountUpdated = await SimpleRecord.getAccountData(accountPublicKey, connection);
    if (accountUpdated !== null) {   
      return [accountPublicKey, accountUpdated];      

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
/// We are passing in a simple record, but could be saving anything to the account
/// The data is simply being stored by the program. 
/// The program is not expecting a certain class
/// Just bytes of data, with an offset so it could be anything
export async function updateSimple(  
  data: SimpleRecord,
  offset: number = 0,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {

  if (_debug) {    
    console.log(`\nAttempting to UPDATE a DYNAMIC Record Account...`);    
  }

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    ACCOUNT_DYNAMIC_SEED!,
    programId,
    connection)
  
  // Only try to update a valid account
  if (account !== null) {
    if (_debug) {
      console.log(`\nUpdating Record Account: ${accountPublicKey} ...`);
      console.log(`\nCreating Transaction: Record program:
                  \nInstructions: Write`);
    }

    // Serialize the data according to schema
    let dynamicRecordSerialized = serialize(
      SimpleRecord.schema,
      data,
    );  

    if (_debug) {    
      console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
      console.log(`dynamicRecordSerialized key: `, new PublicKey(data.key).toBase58());
    }

    // Create Transaction. Add Instructions.    
    const transaction = new Transaction().add(
      // TODO: Instruction: Write
      writeDynamicInstruction(        
        accountPublicKey, 
        authorityPublicKey,
        new BN(offset),
        Buffer.from(dynamicRecordSerialized),
        programId)
    ); 
 
    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...\n`);
    }

    /// Send and Confirm Transaction
    const txid = await sendAndConfirmTransaction(
      connection, 
      transaction, 
      [...signers]
    );
    printTransactionURL(txid, connection); // prints transaction url to console

    if (_debug) { await getParsedTransaction(txid, connection);}            
    if (_debug) {console.log(`\nGetting new account info...`);}

    // Get Account Data    
    let accountUpdated = await SimpleRecord.getAccountData(accountPublicKey, connection);
    if (accountUpdated !== null) {
      return [accountPublicKey, accountUpdated];    
    } 
    else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
    }  
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);    
  }  
  return [accountPublicKey, null];  // if null account does not exists
};

// ------------------------------------------------------------------
// Metadata test
export async function createMetaData(
  data: MetaData,                      // passing type specific
  offset: number = 0,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {
  if (_debug) { console.log(`\nAttempting to CREATE a DYNAMIC Record Account...\n`); } 

  // TODO: test
  let test = await GetAccountInstanceSize(MetaData.schema, data);
  console.log(`\nrecord: GetAccountInstanceSize Dynamic: ${test} \n`);

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    ACCOUNT_DYNAMIC_SEED!,
    programId,
    connection)
  
  // storage for updated account
  // let accountUpdated: RecordDynamicTestMeta | null = null;

  // check account exists
  if (account === null) {
    if (_debug) {
      console.log('Creating NEW DYNAMIC Record Account: ', accountPublicKey.toBase58());
      console.log(`Creating Transaction: Record program:
                \nInstructions: Create, Initialize, 1st Write`);
    }

    // Rent calculation
    const lamports = await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_MAX_SIZE,
    );

    // serialize the data
    let dynamicRecordSerialized = serialize( MetaData.schema, data );    

    console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
    console.log(`dynamicRecordSerialized key: `, new PublicKey(data.parentKey).toBase58());

    // TODO: Build Transaction
    const transaction = new Transaction().add(

      // TODO: Instruction: Create Account 
      SystemProgram.createAccountWithSeed({
        fromPubkey: payerPublicKey,
        basePubkey: authorityPublicKey,
        seed: ACCOUNT_DYNAMIC_SEED!,          // this could be anything 
        newAccountPubkey: accountPublicKey,
        lamports,
        space: ACCOUNT_MAX_SIZE!,             // max size account will ever be
        programId,
      }),

      // TODO: Instruction: Initialize Account Dynamic
      initializeDynamicInstruction(
        accountPublicKey,
        authorityPublicKey,
        programId),

      // TODO: Instruction: WriteDynamic
      writeDynamicInstruction(
        accountPublicKey, 
        authorityPublicKey,        
        new BN(offset),
        Buffer.from(dynamicRecordSerialized),
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
    printTransactionURL(txid, connection); // prints transaction url to console

    if (_debug) { await getParsedTransaction(txid, connection);}            
    if (_debug) {console.log(`\nGetting new account info...`);}

    // Get Account Info
    const accountUpdated = await MetaData.getAccountData(accountPublicKey, connection);    
    if (accountUpdated !== null) {
      return [accountPublicKey, accountUpdated];     
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

/// Update MetaData
export async function updateMetaData(  
  data: MetaData,
  offset: number = 0,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {

  if (_debug) {    
    console.log(`\nAttempting to UPDATE MetaData Record Account...`);    
  }

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    ACCOUNT_DYNAMIC_SEED!,
    programId,
    connection)
  
  // Only try to update a valid account
  if (account !== null) {
    if (_debug) {
      console.log(`\nUpdating Record Account: ${accountPublicKey} ...`);
      console.log(`\nCreating Transaction: Record program:
                  \nInstructions: Write`);
    }

    // Serialize the data according to schema
    let dynamicRecordSerialized = serialize(
      MetaData.schema,
      data,
    );  

    if (_debug) {    
      console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
      console.log(`dynamicRecordSerialized key: `, new PublicKey(data.parentKey).toBase58());
    }

    // Create Transaction. Add Instructions.    
    const transaction = new Transaction().add(
      // TODO: Instruction: Write
      writeDynamicInstruction(        
        accountPublicKey, 
        authorityPublicKey,
        new BN(offset),
        Buffer.from(dynamicRecordSerialized),
        programId)
    ); 
 
    if (_debug) {
      console.log(`\nTransaction details: \n`, transaction);
      console.log(`\nSending Transaction...\n`);
    }

    /// Send and Confirm Transaction
    const txid = await sendAndConfirmTransaction(
      connection, 
      transaction, 
      [...signers]
    );
    printTransactionURL(txid, connection); // prints transaction url to console

    if (_debug) { await getParsedTransaction(txid, connection);}            
    if (_debug) {console.log(`\nGetting new account info...`);}

    // Get Account Data    
    let accountUpdated = await MetaData.getAccountData(accountPublicKey, connection);
    if (accountUpdated !== null) {
      return [accountPublicKey, accountUpdated];    
    } 
    else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);
    }  
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                  `-> Account not found: ${accountPublicKey}  \n`);    
  }  
  return [accountPublicKey, null];  // if null account does not exists
};
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

const _debug = false; // debug flag

// Account Seeds
export function getAccountSeed(seed: string, unique?: boolean) {
  let _seed = unique ? Date.now().toString(): '';
  if (_debug) { console.log(`\ngetAccountSeed: `, _seed); }
  console.log(`\ngetAccountSeed: `, _seed);
  return _seed;
};

export const ACCOUNT_DYNAMIC_SEED = 'spl_record_dynamic';
if (_debug) {console.log(`\nACCOUNT_DYNAMIC_SEED: `, ACCOUNT_DYNAMIC_SEED);}

// ACCOUNT SIZE - for dynamic size with max allowance
export const ACCOUNT_MAX_SIZE = 150;  // for dynamic data, up to max size account data
                                      // currently unable to change account size after initial account
                                      // allocation, set this to the max size estimated for account
if (_debug) {console.log(`\nRecord: ACCOUNT_MAX_SIZE: ${ACCOUNT_MAX_SIZE} \n`);}

export async function GetAccountInstanceSize(schema: any, instance: any): Promise<number | null> {  
  console.log(`\nGetAccountInstanceSize: `, schema, instance);
  return serialize(schema, instance).length;
}

/// Method Implementations  --------------------------------------------
/// Dynamic Record Account Implementation Methods:
/// Create Dynamic Record Account (Create, Initialize, and first Write)
/// Dynamic applies to the data itself, which may vary by size and type
/// Use dynamic record for generic store
/// Client knows by key what to expect & deserialize accordingly
/// Account key is created with a seed, for reference and lookup
/// Record contains, owner, authority, version, and data (many)
export async function createSimple(
  data: SimpleRecord,            // passing type specific
  offset: number = 0,
  payerPublicKey: PublicKey,
  authorityPublicKey: PublicKey,
  signers: Signer[],
  seed: string,
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null, boolean]> {
  if (_debug) { console.log(`\nAttempting to CREATE a DYNAMIC Record Account...\n`); } 
  
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    seed,
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

    if (_debug) {
      console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
      console.log(`dynamicRecordSerialized key: `, new PublicKey(data.key).toBase58());
    }

    // Build Transaction
    const transaction = new Transaction().add(

      // Create Account 
      SystemProgram.createAccountWithSeed({
        fromPubkey: payerPublicKey,           // 
        basePubkey: authorityPublicKey,       //
        seed,                                 // this could be anything 
        newAccountPubkey: accountPublicKey,   // 
        lamports,                             // rent cost
        space: ACCOUNT_MAX_SIZE!,             // max size account will ever be
        programId,
      }),

      // Initialize Account Dynamic
      initializeDynamicInstruction(
        accountPublicKey,
        authorityPublicKey,
        programId),

      // Instruction: WriteDynamic
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
      return [accountPublicKey, accountUpdated, false];      

    } else {
      console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`, 
                  `-> Account not found: ${accountPublicKey}  \n`);
    }        
  } else {
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_YELLOW_PREP}`, 
                  `-> Account already exists:: ${accountPublicKey}  \n`);
  }  
  // get Account Info    
  const accountData = await SimpleRecord.getAccountData(accountPublicKey, connection);
  if (accountData !== null){
    return [accountPublicKey, accountData, true]; // account already exists
  }
  return [accountPublicKey, null, true];  // account exists, could not get data?
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
  seed: string,
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {

  if (_debug) {    
    console.log(`\nAttempting to UPDATE a DYNAMIC Record Account...`);    
  }

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    seed,
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
  seed: string,
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {
  if (_debug) { console.log(`\nAttempting to CREATE a DYNAMIC Record Account...\n`); } 

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    seed,
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

    // serialize the data
    let dynamicRecordSerialized = serialize( MetaData.schema, data );    

    console.log(`dynamicRecordSerialized: `, dynamicRecordSerialized);
    console.log(`dynamicRecordSerialized key: `, new PublicKey(data.parentKey).toBase58());

    // Build Transaction
    const transaction = new Transaction().add(

      // Instruction: Create Account 
      SystemProgram.createAccountWithSeed({
        fromPubkey: payerPublicKey,
        basePubkey: authorityPublicKey,
        seed,                                 // this could be anything 
        newAccountPubkey: accountPublicKey,
        lamports,
        space: ACCOUNT_MAX_SIZE!,             // max size account will ever be
        programId,
      }),

      initializeDynamicInstruction(
        accountPublicKey,
        authorityPublicKey,
        programId),
      
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
  seed: string,
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, any | null]> {

  if (_debug) {    
    console.log(`\nAttempting to UPDATE MetaData Record Account...`);    
  }

  // Get Account
  const [accountPublicKey, account] = await getAccountWithSeed(
    payerPublicKey,
    seed!,
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
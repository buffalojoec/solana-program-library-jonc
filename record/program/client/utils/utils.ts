/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
// @ts-nocheck

import os from 'os';
import fs from 'mz/fs.js';
import path from 'path';
import yaml from 'yaml';
import BN from 'bn.js';
import assert from 'assert';
import { 
  PublicKey, 
  Keypair, 
  Connection, 
  AccountInfo,
  ParsedConfirmedTransaction } from '@solana/web3.js';

// TODO: Extract: ------------------------------------------------------------
//
// TODO: IMPLEMENT: DELETE | CLOSE | UPDATE AUTHORITY | OTHER?
export async function getParsedTransaction(
  txid: string, 
  connection: Connection
): Promise<ParsedConfirmedTransaction | null> {  
    console.log(`\nGet ParsedConfirmedTransaction...\n`)
    const parsed_transaction = await connection.getParsedConfirmedTransaction(txid, 'confirmed');
    console.log(`\nParsed Confirmed Transaction Details: \n`, parsed_transaction, `\n`);
    return parsed_transaction;
};

// TODO: getTransactionURL (TODO:cluster)
export const printTransactionURL = (txid: String, connection: Connection): String => {  
  
  // "devnet" | "testnet" | "" (mainnet) | localhost = customUrl=http%3A%2F%2Flocalhost%3A8899  

  const cluster = `custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
  const url = `https://explorer.solana.com/tx/${txid}?cluster=${cluster}`;
  console.log(`\nTransaction url:\n`, url);
  return url;
};

export async function getAccountWithSeed(
  base: PublicKey, 
  seed: string, 
  programId: PublicKey,
  connection: Connection,
): Promise<[PublicKey, AccountInfo<Buffer> | null]> {
  // if (_debug) { console.log(`\nGet account address with seed...`); }

  const accountPublicKey = await PublicKey.createWithSeed(
    base,
    seed,
    programId,
  );
  
  // if (_debug) { console.log(`\nChecking if account exists: ${accountPublicKey}`); }
  const account = await connection.getAccountInfo(accountPublicKey);     
  return [accountPublicKey, account];
};
// EXTRACT
// --------------------------------------------------------------

export async function newAccountWithLamports(
  connection: Connection,
  lamports = 1000000,
): Promise<Keypair> {
  const keypair = Keypair.generate();
  const signature = await connection.requestAirdrop(
    keypair.publicKey,
    lamports,
  );
  await connection.confirmTransaction(signature);
  return keypair;
}

/**
 * @private
 */
async function getConfig(): Promise<any> {
  // Path to Solana CLI config file
  const CONFIG_FILE_PATH = path.resolve(
    os.homedir(),
    '.config',
    'solana',
    'cli',
    'config.yml',
  );  
  const configYml = await fs.readFile(CONFIG_FILE_PATH, {encoding: 'utf8'});  
  return yaml.parse(configYml);
}

/**
 * Load and parse the Solana CLI config file to determine which RPC url to use
 */
export async function getRpcUrl(): Promise<string> {
  try {
    const config = await getConfig();    
    if (!config.json_rpc_url) throw new Error('Missing RPC URL');
    return config.json_rpc_url;
  } catch (err) {
    console.warn(
      'Failed to read RPC url from CLI config file, falling back to localhost',
    );
    return 'http://localhost:8899';
  }
}

/**
 * Load and parse the Solana CLI config file to determine which payer to use
 */
export async function getPayer(): Promise<Keypair> {
  try {
    const config = await getConfig();
    if (!config.keypair_path) throw new Error('Missing keypair path');
    return createKeypairFromFile(config.keypair_path);
  } catch (err) {
    console.warn(
      'Failed to create keypair from CLI config file, falling back to new random keypair',
    );
    return Keypair.generate();
  }
}

/**
 * Create a Keypair from a secret key stored in file as bytes' array
 */
export async function createKeypairFromFile(
  filePath: string,
): Promise<Keypair> {  
  const secretKeyString = await fs.readFile(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

// TODO: testing:
// TODO: TEST UTILS
export function deepStrictEqualBN(decodedData: object, expectedData: object) {
  /**
   * Helper function to do deep equality check because BNs are not equal.
   * TODO: write this function recursively. For now, sufficient.
   */
  for (const key in decodedData) {
    if (expectedData[key] instanceof BN) {
      assert.ok(expectedData[key].eq(decodedData[key]));
    } else {
      if (decodedData[key] instanceof Object) {
        for (const subkey in decodedData[key]) {
          if (decodedData[key][subkey] instanceof Object) {
            if (decodedData[key][subkey] instanceof BN) {
              assert.ok(decodedData[key][subkey].eq(expectedData[key][subkey]));
            } else {
              for (const subsubkey in decodedData[key][subkey]) {
                console.log(decodedData[key][subkey][subsubkey]);
                if (decodedData[key][subkey][subsubkey] instanceof BN) {
                  assert.ok(
                    decodedData[key][subkey][subsubkey].eq(
                      expectedData[key][subkey][subsubkey],
                    ),
                  );
                } else {
                  assert.deepStrictEqual(
                    expectedData[key][subkey][subsubkey],
                    decodedData[key][subkey][subsubkey],
                  );
                }
              }
            }
          } else {
            assert.strictEqual(
              decodedData[key][subkey],
              expectedData[key][subkey],
            );
          }
        }
      } else {
        assert.strictEqual(decodedData[key], expectedData[key]);
      }
    }
  }
}
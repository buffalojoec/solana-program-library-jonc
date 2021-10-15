import {
    Keypair,
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';

import {
    getPayer,
    getRpcUrl,
    newAccountWithLamports,
    createKeypairFromFile,  
} from './utils/utils';

import fs from 'mz/fs';
import path from 'path';
// import { KeyPairSyncResult } from 'crypto';

/**
 * Path to program files
 */ 
 export const PROGRAM_PATH = path.resolve(__dirname, '../../../target/deploy');
  
/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running either:
 *   - `npm run build:program-rust`
 */
export const PROGRAM_NAME = 'spl_record';
export const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, PROGRAM_NAME + '.so');
 
/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy <PROGRAM_PATH>/spl_record.so`
 */
export const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, PROGRAM_NAME + '-keypair.json');
 

/**
 * Check if the BPF program has been deployed
 */
export async function checkProgram(
    keyPairFilePath: string,
    programSoPath: string,
    connection: Connection,
): Promise<PublicKey> {  
    let programId: PublicKey;

    try {
        const programKeypair = await createKeypairFromFile(keyPairFilePath);
        programId = programKeypair.publicKey;
    } catch (err) {
        const errMsg = (err as Error).message;
        throw new Error(
        `Failed to read program keypair at '${keyPairFilePath}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``,
        );
    }

    // Check if the program has been deployed    
    const programInfo = await connection.getAccountInfo(programId);
    if (programInfo === null) {
        if (fs.existsSync(programSoPath)) {
        throw new Error(
            `Program needs to be deployed with: solana program deploy ${programSoPath}`,
        );
        } else {
        throw new Error('Program needs to be built and deployed');
        }
    } else if (!programInfo.executable) {
        throw new Error(`Program is not executable`);
    } 
    console.log(`\nUsing program ${programId.toBase58()}`);      
    return programId;
}

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<Connection> {    
    const rpcUrl = await getRpcUrl();    
    const connection = new Connection(rpcUrl, 'confirmed');
    const version = await connection.getVersion();
    console.log('Connection to cluster established:', rpcUrl, version);
    return connection;
}
       
/**
 * Establish an account to pay for everything
 */
export async function establishPayer(    
    connection: Connection,
    funds?: number,
): Promise<Keypair> {    
   let payer: Keypair; 
   try {
        // Get payer from cli config
        payer = await getPayer();
        if (funds !== null) 
            requestAirdrop((funds! | 0), payer.publicKey, connection);

    } catch (err) {
        // Fund a new payer via airdrop
        payer = await newAccountWithLamports(connection);
    }
    
    const lamports = await connection.getBalance(payer.publicKey);
    console.log(
        `\nPayer Established:`,
        `\npublicKey: `, payer.publicKey.toBase58(),
        `\nbalance: '`, lamports / LAMPORTS_PER_SOL, `' SOL`,     
    );
    return payer;   
}

/**
 * Request and airdrop for new Account funds
 * size: of account in bytes
 */
export async function requestAirdropForNewAcount(
    accountSize: number,
    payerPublicKey: PublicKey,     
    connection: Connection
): Promise<void> {
    let fees = 0;  
  
    // TODO: establish payer
    if (payerPublicKey && accountSize) {        
        const {feeCalculator} = await connection.getRecentBlockhash();

        // TODO: calculating program size
        // Calculate the cost to fund the greeter account
        fees += await connection.getMinimumBalanceForRentExemption(accountSize);    
    
        // Calculate the cost of sending transactions
        fees += feeCalculator.lamportsPerSignature * 100; // wag
    
        const lamports = await connection.getBalance(payerPublicKey);
        if (lamports < fees) { 
            requestAirdrop(fees - lamports, payerPublicKey, connection);
        }
    }   
  }
 
/**
 * Request Airdrop for funds in lamports
 */
export async function requestAirdrop(
    lamports: number,
    publicKey: PublicKey,
    connection: Connection
): Promise<void> {
    if (lamports > 0) {
        const sig = await connection.requestAirdrop(publicKey, lamports);
        await connection.confirmTransaction(sig);
    }
}
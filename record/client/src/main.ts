import {
    Keypair,
    Connection,
    PublicKey,
    Signer,
} from '@solana/web3.js';

import {
    establishConnection,
    establishPayer,
    checkProgram,
    PROGRAM_KEYPAIR_PATH,
    PROGRAM_SO_PATH
} from './connection';

import BN from 'bn.js'; // prefer bigint instead of BN (which I just found out about!)
import './utils/borsh_ext'  // extends borsh with pubkey
import * as ConsoleUtils from './utils/console';
import { deepStrictEqualBN } from './utils/utils';
import assert from 'assert';

import * as RecordModels from './record/models';

import {
    create as createRecordAccount,
    update as updateRecordAccount,
    setAuthority as setAuthorityRecordAccount,
    closeAccount as closeRecordAccount,
    RECORD_ACCOUNT_SIZE,
    ACCOUNT_SEED as RECORD_ACCOUNT_SEED,
} from './record/record';

import {
    ACCOUNT_MAX_SIZE,
    ACCOUNT_DYNAMIC_SEED as RECORD_ACCOUNT_DYNAMIC_SEED,
    createSimple as getOrCreateSimpleRecord,
    updateSimple as updateSimpleRecord,
    createMetaData as createMetaDataRecord,
    updateMetaData as updateMetaDataRecord,
    getAccountSeed,
} from './record_dynamic/record_dynamic';

import {
    SimpleRecord,
    MetaData,
} from './record_dynamic/models';

// --------------------------------------------------------------------------
/// Global Env Test

// these variables could use a comment explaining what they're for
let connection: Connection;
let payer: Keypair;
let programId: PublicKey;
let signers: Signer[] = [];
let authorityPublicKey: PublicKey;

// --------------------------------------------------------------------------
/// Setup Environment
async function setupEnvironment() {
    console.log(`\nConnecting to cluster...`);

    // Establish connection to the cluster
    connection = await establishConnection();

    // Determine who pays for the fees
    payer = await establishPayer(connection);

    // Check if the program has been deployed
    programId = new PublicKey("ReciQBw6sQKH9TVVJQDnbnJ5W7FP539tPHjZhRF4E9r");
    //programId = await checkProgram(
    //    PROGRAM_KEYPAIR_PATH,
    //    PROGRAM_SO_PATH,
    //    connection,
    //);

    // Signers & Authority
    signers.push(payer);
    authorityPublicKey = payer.publicKey;
}

// --------------------------------------------------------------------------
/// Main
async function main() {
    console.log("Let's read and write data with Solana!\n");

    // Setup (connection, payer, signer, authority)
    console.log(`\nSetting up Environment...`);
    await setupEnvironment();

    // --------------------------------------------------------------------------
    /// 1. DEFAULT RECORD IMPLEMENTATION FIXED SIZE DATA

    /// Create Record  -----------------------------------------------
    console.log(`\nCreate Record...`);
    let msg: string = "initial data saved to an account";
    const initialData = new RecordModels.Data({
      offset: 0,
      data: msg,
    });

    console.log(`\n\nRECORD_ACCOUNT_SEED: `, RECORD_ACCOUNT_SEED);
    const [recordAccountPublicKey, recordAccount] = await createRecordAccount(
        initialData,                // initial data to write to the record account
        payer.publicKey,            // payer public key (for system program create account)
        authorityPublicKey,         // authority for this record account
        signers,                    // signer(s), to pay for transactions
        RECORD_ACCOUNT_SEED!,       // Record Account Seed
        programId,                  // program (Id, address, publicKey)
        connection);

    assert.strictEqual(initialData.data, recordAccount?.dataFormatted);
    deepStrictEqualBN(authorityPublicKey, recordAccount!.authority);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Create Record: Tests successfully passed!');

    // Update Record -----------------------------------------------
    console.log(`\nUpdating Record...`);
    let msg_update: string = "record account data was updated!";
    const newData = new RecordModels.Data({
        offset: 0,
        data: msg_update,
      });

    const updatedRecord = await updateRecordAccount(
        newData,                        // new data to write
        recordAccountPublicKey,         // existing record account
        authorityPublicKey,             // authority on record account
        signers,                        // signers - [0] is payer
        programId,                      //
        connection,                     //
    );

    // Simple log and Validation
    console.log(`\nAccount Key:`, recordAccountPublicKey.toBase58());

    console.log(`\nData Compare:`,
                `\nBefore: `, initialData.data,
                `\nAfter : `, updatedRecord?.dataFormatted);

    // Validation
    assert.notStrictEqual(initialData.data, updatedRecord?.dataFormatted);
    deepStrictEqualBN(authorityPublicKey, updatedRecord!.authority);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Update Record: Tests successfully passed!');

    // Set Authority -----------------------------------------------
    console.log(`\nSet Authority...`);
    const newAuthority = Keypair.generate();

    const newAuthorityRecord = await setAuthorityRecordAccount(
        recordAccountPublicKey,         // existing record account
        authorityPublicKey,                      // authority on record account
        newAuthority.publicKey,         // new authority
        signers,                        // signers - [0] is payer
        programId,                      //
        connection,                     //
    );

    console.log(`\nAuthority Compare:`,
                `\nBefore: `, authorityPublicKey.toString(),
                `\nAfter : `, newAuthorityRecord!.authority.toString());

    // Validation
    assert.notStrictEqual(authorityPublicKey.toString(), newAuthorityRecord!.authority.toString());
    assert.strictEqual(updatedRecord?.dataFormatted, newAuthorityRecord?.dataFormatted);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Set Authority: Tests successfully passed!');

    // Close Account -----------------------------------------------
    console.log(`\nClose Account...`);

    // Add new authority to signers
    signers.push(newAuthority);

    const closed = await closeRecordAccount(
        recordAccountPublicKey,         // existing record account
        newAuthority.publicKey,         // authority on record account
        newAuthority.publicKey,         // destination for sending remaining balance
        signers,                        // signers - [0] is payer
        programId,                      //
        connection,                     //
    );

    // Validation
    assert.strictEqual(true, closed);

    if (closed){
        console.log(`\nClosed Account: ${recordAccountPublicKey}`, );
        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                    '-> Close Record Account: Tests successfully passed!');
    }else {
        console.log(`\n${ConsoleUtils.CONSOLE_COLOR_RED_PREP}`,
                '-> Close Account Failed! : ${recordAccountPublicKey}');
    }
    // ----------------------------------------------------------------

    // Cleanup Signers: Removing previously added authority from signers `continuous testing.
    signers.pop();

    // ----------------------------------------------------------------
    /// 2. CREATE DYNAMIC RECORD 1. Simple Record

    /// Create Dynamic Record 1 -----------------------------------------------
    console.log(`\nCreating a Dynamic Simple Record...`);
    const createKey = Keypair.generate().publicKey;  // throw away test key
    const simpleRecord = new SimpleRecord({
        key: createKey.toBytes(),
        message: "created a dynamic message",
      })

    const seed = getAccountSeed(RECORD_ACCOUNT_DYNAMIC_SEED);
    console.log(`\n\nseed: ${seed}`);

    // create a dynamic (any data) record account
    // returns: the account info and public key for the new account if successful
    const [ simpleRecordPublicKey,
            simpleRecordResult,
            recordExists] = await getOrCreateSimpleRecord(
            simpleRecord,                   // initial data to write to the record account
            0,                              // data offset (0)
            payer.publicKey,                // payer public key (for system program create account)
            authorityPublicKey,             // authority for this record account
            signers,                        // signer(s), to pay for transactions
            seed!,                          // Record Account Seed
            programId,                      // program (Id, address, publicKey)
            connection
    );

    // Simple log and Validation
    console.log(`\nAccount Key:`, simpleRecordPublicKey.toBase58());

    console.log(`\nsimpleRecordPublicKey`, simpleRecordPublicKey,
            `\nsimpleRecordResult`,simpleRecordResult,
            `\nrecordExists`, recordExists);

    let simpleKeyCreateFormatted;

    if (recordExists) {
        simpleKeyCreateFormatted = new PublicKey(simpleRecordResult!.key).toBase58()
        console.log(`\nRecord Already Exists:`,
                    `\nData:`,
                    `\nkey: `, simpleKeyCreateFormatted,
                    `\nMessage : `, simpleRecordResult?.message);
    } else {
        console.log('\nCreated new Record Account:');
        console.log(`\nData Compare: Message:`,
                    `\nBefore: `, simpleRecord?.message,
                    `\nAfter : `, simpleRecordResult?.message);

        simpleKeyCreateFormatted = new PublicKey(simpleRecordResult!.key).toBase58()
        console.log(`\nData: Compare Key:`,
                    `\nBefore: `, createKey.toBase58(),
                    `\nAfter : `, simpleKeyCreateFormatted);

        assert.strictEqual(createKey.toBase58(), simpleKeyCreateFormatted);
        assert.strictEqual(simpleRecord!.message, simpleRecordResult!.message);
    }
    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Create Dynamic Simple Record: Tests successfully passed!');

    /// Update Dynamic Record 1 -----------------------------------------------
    console.log(`\nUpdating a Dynamic Simple Record with same data model...`);

    let simpleUpdateKey = Keypair.generate().publicKey;  // throw away test key
    const simpleRecordUpdate = new SimpleRecord({
        key: simpleUpdateKey.toBytes(),
        message: "updated the dynamic message",
      })

    // create a dynamic (any data) record account
    // returns: the account info and public key for the new account if successful
    const [ simpleRecordPublicKeyUpdate,
            simpleRecordUpdateResult] = await updateSimpleRecord(
            simpleRecordUpdate,            // initial data to write to the record account
            0,                              // data offset (0)
            payer.publicKey,                // payer public key (for system program create account)
            authorityPublicKey,             // authority for this record account
            signers,                        // signer(s), to pay for transactions
            seed!,                          // Record Account Seed
            programId,                      // program (Id, address, publicKey)
            connection
    );

    // Validation
    console.log(`\nAccount Key Compare:`,
                `\nBefore: `, simpleRecordPublicKey.toBase58(),
                `\nAfter : `, simpleRecordPublicKeyUpdate.toBase58());

    console.log(`\nData Compare: Message:`,
                `\nBefore: `, simpleRecord!.message,
                `\nAfter : `, simpleRecordUpdateResult!.message);

    let simpleKeyUpdateFormatted = new PublicKey(simpleRecordUpdateResult!.key).toBase58()
    console.log(`\nData Compare: Key:`,
                `\nBefore: `, simpleKeyCreateFormatted,
                `\nAfter : `, simpleKeyUpdateFormatted);

    assert.strictEqual(simpleRecordPublicKey.toBase58(), simpleRecordPublicKeyUpdate.toBase58());
    assert.notStrictEqual(simpleKeyUpdateFormatted, simpleKeyCreateFormatted);
    assert.strictEqual(simpleUpdateKey.toBase58(), simpleKeyUpdateFormatted);
    assert.strictEqual(simpleRecordUpdate!.message, simpleRecordUpdateResult!.message);
    assert.notStrictEqual(simpleRecord!.message, simpleRecordUpdateResult!.message);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Update Dynamic Simple Record: Tests successfully passed!');

    // ----------------------------------------------------------------
    /// Create Dynamic Record 2. Metadata
    console.log(`\nCreating MetaData Record (with more data) ...`);

    /// Create Dynamic Record 2 ---------------------------------------
    const parent_key = Keypair.generate().publicKey;  // throw away test key
    const metaDataNew = new MetaData({
        parentKey: parent_key.toBytes(),
        name: "first fancy name",
        description: "a fancy first description",
        uri: "http://url",
        isMutable: true,
        amount: new BN(1225),
        shares: 120,
    });

    const seed_meta = getAccountSeed(RECORD_ACCOUNT_DYNAMIC_SEED, true);
    // create a dynamic (any data) record account
    // returns: the account info and public key for the new account if successful
    const [ metaDataPublicKey,
            metaDataRecordAccount] = await createMetaDataRecord(
            metaDataNew,                  // initial data to write to the record account
            0,                              // data offset (0)
            payer.publicKey,                // payer public key (for system program create account)
            authorityPublicKey,             // authority for this record account
            signers,                        // signer(s), to pay for transactions
            seed_meta!,                     // Record Account Seed
            programId,                      // program (Id, address, publicKey)
            connection
    );

    console.log(`\nAccount Key Created:`, metaDataPublicKey);

    // Simple comparison and validation
    console.log(`\nData Compare: Name:`,
                `\nExpected: `, metaDataNew!.name,
                `\nReceived: `, metaDataRecordAccount!.name);

    const metadataPublicKeyFormatted = new PublicKey(metaDataRecordAccount!.parentKey).toBase58()

    console.log(`\nData Compare: Parent Key:`,
                `\nExpected: `, parent_key.toBase58(),
                `\nReceived : `, metadataPublicKeyFormatted);

    assert.strictEqual(parent_key.toBase58(), metadataPublicKeyFormatted);
    assert.strictEqual(metaDataNew!.name, metaDataRecordAccount!.name);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Create MetaData Record: Tests successfully passed!');

    /// Update Dynamic Record 2 ---------------------------------------
    console.log(`\nUpdating MetaData Record ...`);
    const meta_data_update = new MetaData({
        parentKey: parent_key.toBytes(),
        name: "different name",
        description: "updated..",
        uri: "http://url",
        isMutable: true,
        amount: new BN(444),
        shares: 13,
    });

    // update meta data
    // returns: the account info and public key for the new account if successful
    const [ metaDataPublicKeyUpdate,
            metaDataRecordAccountUpdated] = await updateMetaDataRecord(
            meta_data_update,               // initial data to write to the record account
            0,                              // data offset (0)
            payer.publicKey,                // payer public key (for system program create account)
            authorityPublicKey,             // authority for this record account
            signers,                        // signer(s), to pay for transactions
            seed_meta!,                     // Record Account Seed
            programId,                      // program (Id, address, publicKey)
            connection
    );

    // Validation
    console.log(`\nAccount Key Compare:`,
                `\nBefore: `, metaDataPublicKey.toBase58(),
                `\nAfter : `, metaDataPublicKeyUpdate.toBase58());

    console.log(`\nData Compare: Should be different`,
                `\nBefore Update: `, metaDataRecordAccount!.name,
                `\nAfter Update : `, metaDataRecordAccountUpdated!.name);

    const metaDataPublicKeyAfter = new PublicKey(metaDataRecordAccountUpdated!.parentKey).toBase58()
    console.log(`\nData Compare: Parent Key: Should be the same`,
                `\nBefore Update: `, metadataPublicKeyFormatted,
                `\nAfter Update : `, metaDataPublicKeyAfter);

    assert.strictEqual(metaDataPublicKey.toBase58(), metaDataPublicKeyUpdate.toBase58());
    assert.strictEqual(meta_data_update!.name, metaDataRecordAccountUpdated!.name);

    console.log(`\n${ConsoleUtils.CONSOLE_COLOR_GREEN_PREP}`,
                '-> Update MetaData Record: Tests successfully passed!');

  }
  // --------------------------------------------------------------------------

  /// Main #
  main().then(
    () => process.exit(),
    err => {
      console.error(err);
      process.exit(-1);
    },
  );

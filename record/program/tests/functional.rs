#![cfg(feature = "test-bpf")]

use {
    borsh::{BorshDeserialize, BorshSerialize,
        maybestd::io::{Error, Write}, },
    solana_program::{
        borsh:: {get_packed_len, get_instance_packed_len, try_from_slice_unchecked},
        instruction::{AccountMeta, Instruction, InstructionError},
        program_pack::Pack,
        pubkey::Pubkey,
        rent::Rent,
        system_instruction,
        account_info::AccountInfo,
        program_error::ProgramError, program_pack::IsInitialized,     
    },
    solana_program_test::*,
    solana_sdk::{
        signature::{Keypair, Signer},
        transaction::{Transaction, TransactionError},
        transport,
        account::Account,
    },
    spl_record::{
        error::RecordError,
        id, instruction,
        processor::process_instruction,
        state::{
            Data, 
            RecordData, 
            RecordDataDynamic,            
            // DataNew, RecordDataNew, DataBasic, RecordDataBasic
        },
    },
    std::str,    
};

// program test instance
fn program_test() -> ProgramTest {
    ProgramTest::new("spl_record", id(), processor!(process_instruction))
}

async fn initialize_storage_account(
    context: &mut ProgramTestContext,
    authority: &Keypair,
    account: &Keypair,
    data: Data,
) -> transport::Result<()> {
    let transaction = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &context.payer.pubkey(),
                &account.pubkey(),
                1.max(Rent::default().minimum_balance(get_packed_len::<RecordData>())),
                get_packed_len::<RecordData>() as u64,
                &id(),
            ),
            instruction::initialize(&account.pubkey(), &authority.pubkey()),
            instruction::write(
                &account.pubkey(),
                &authority.pubkey(),
                0,
                data.try_to_vec().unwrap(),
            ),
        ],
        Some(&context.payer.pubkey()),
        &[&context.payer, account, authority],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(transaction).await
}

#[tokio::test]
async fn initialize_success() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [111u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data.clone())
        .await
        .unwrap();
    let account_data = context
        .banks_client
        .get_account_data_with_borsh::<RecordData>(account.pubkey())
        .await
        .unwrap();
    assert_eq!(account_data.data, data);
    assert_eq!(account_data.authority, authority.pubkey());
    assert_eq!(account_data.version, RecordData::CURRENT_VERSION);
}

#[tokio::test]
async fn initialize_with_seed_success() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let seed = "storage";
    let account = Pubkey::create_with_seed(&authority.pubkey(), seed, &id()).unwrap();
    let data = Data {
        bytes: [111u8; Data::DATA_SIZE],
    };
    let transaction = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account_with_seed(
                &context.payer.pubkey(),
                &account,
                &authority.pubkey(),
                seed,
                1.max(Rent::default().minimum_balance(get_packed_len::<RecordData>())),
                get_packed_len::<RecordData>() as u64,
                &id(),
            ),
            instruction::initialize(&account, &authority.pubkey()),
            instruction::write(&account, &authority.pubkey(), 0, data.try_to_vec().unwrap()),
        ],
        Some(&context.payer.pubkey()),
        &[&context.payer, &authority],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();
    let account_data = context
        .banks_client
        .get_account_data_with_borsh::<RecordData>(account)
        .await
        .unwrap();
    assert_eq!(account_data.data, data);
    assert_eq!(account_data.authority, authority.pubkey());
    assert_eq!(account_data.version, RecordData::CURRENT_VERSION);
}

#[tokio::test]
async fn initialize_twice_fail() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [111u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();
    let transaction = Transaction::new_signed_with_payer(
        &[instruction::initialize(
            &account.pubkey(),
            &authority.pubkey(),
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(0, InstructionError::AccountAlreadyInitialized)
    );
}

#[tokio::test]
async fn write_success() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let new_data = Data {
        bytes: [200u8; Data::DATA_SIZE],
    };
    let transaction = Transaction::new_signed_with_payer(
        &[instruction::write(
            &account.pubkey(),
            &authority.pubkey(),
            0,
            new_data.try_to_vec().unwrap(),
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &authority],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    let account_data = context
        .banks_client
        .get_account_data_with_borsh::<RecordData>(account.pubkey())
        .await
        .unwrap();
    assert_eq!(account_data.data, new_data);
    assert_eq!(account_data.authority, authority.pubkey());
    assert_eq!(account_data.version, RecordData::CURRENT_VERSION);
}

#[tokio::test]
async fn write_fail_wrong_authority() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let new_data = Data {
        bytes: [200u8; Data::DATA_SIZE],
    };
    let wrong_authority = Keypair::new();
    let transaction = Transaction::new_signed_with_payer(
        &[instruction::write(
            &account.pubkey(),
            &wrong_authority.pubkey(),
            0,
            new_data.try_to_vec().unwrap(),
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &wrong_authority],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(
            0,
            InstructionError::Custom(RecordError::IncorrectAuthority as u32)
        )
    );
}

#[tokio::test]
async fn write_fail_unsigned() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let data = Data {
        bytes: [200u8; Data::DATA_SIZE],
    }
    .try_to_vec()
    .unwrap();
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            id(),
            &instruction::RecordInstruction::Write { offset: 0, data },
            vec![
                AccountMeta::new(account.pubkey(), false),
                AccountMeta::new_readonly(authority.pubkey(), false),
            ],
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(0, InstructionError::MissingRequiredSignature)
    );
}

#[tokio::test]
async fn close_account_success() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();
    let recipient = Pubkey::new_unique();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction::close_account(
            &account.pubkey(),
            &authority.pubkey(),
            &recipient,
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &authority],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    let account = context
        .banks_client
        .get_account(recipient)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        account.lamports,
        1.max(Rent::default().minimum_balance(get_packed_len::<RecordData>()))
    );
}

#[tokio::test]
async fn close_account_fail_wrong_authority() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let wrong_authority = Keypair::new();
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            id(),
            &instruction::RecordInstruction::CloseAccount,
            vec![
                AccountMeta::new(account.pubkey(), false),
                AccountMeta::new_readonly(wrong_authority.pubkey(), true),
                AccountMeta::new(Pubkey::new_unique(), false),
            ],
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &wrong_authority],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(
            0,
            InstructionError::Custom(RecordError::IncorrectAuthority as u32)
        )
    );
}

#[tokio::test]
async fn close_account_fail_unsigned() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            id(),
            &instruction::RecordInstruction::CloseAccount,
            vec![
                AccountMeta::new(account.pubkey(), false),
                AccountMeta::new_readonly(authority.pubkey(), false),
                AccountMeta::new(Pubkey::new_unique(), false),
            ],
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(0, InstructionError::MissingRequiredSignature)
    );
}

#[tokio::test]
async fn set_authority_success() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();
    let new_authority = Keypair::new();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction::set_authority(
            &account.pubkey(),
            &authority.pubkey(),
            &new_authority.pubkey(),
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &authority],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    let account_data = context
        .banks_client
        .get_account_data_with_borsh::<RecordData>(account.pubkey())
        .await
        .unwrap();
    assert_eq!(account_data.authority, new_authority.pubkey());

    let new_data = Data {
        bytes: [200u8; Data::DATA_SIZE],
    };
    let transaction = Transaction::new_signed_with_payer(
        &[instruction::write(
            &account.pubkey(),
            &new_authority.pubkey(),
            0,
            new_data.try_to_vec().unwrap(),
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &new_authority],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    let account_data = context
        .banks_client
        .get_account_data_with_borsh::<RecordData>(account.pubkey())
        .await
        .unwrap();
    assert_eq!(account_data.data, new_data);
    assert_eq!(account_data.authority, new_authority.pubkey());
    assert_eq!(account_data.version, RecordData::CURRENT_VERSION);
}

#[tokio::test]
async fn set_authority_fail_wrong_authority() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let wrong_authority = Keypair::new();
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            id(),
            &instruction::RecordInstruction::SetAuthority,
            vec![
                AccountMeta::new(account.pubkey(), false),
                AccountMeta::new_readonly(wrong_authority.pubkey(), true),
                AccountMeta::new(Pubkey::new_unique(), false),
            ],
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer, &wrong_authority],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(
            0,
            InstructionError::Custom(RecordError::IncorrectAuthority as u32)
        )
    );
}

#[tokio::test]
async fn set_authority_fail_unsigned() {
    let mut context = program_test().start_with_context().await;

    let authority = Keypair::new();
    let account = Keypair::new();
    let data = Data {
        bytes: [222u8; Data::DATA_SIZE],
    };
    initialize_storage_account(&mut context, &authority, &account, data)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            id(),
            &instruction::RecordInstruction::SetAuthority,
            vec![
                AccountMeta::new(account.pubkey(), false),
                AccountMeta::new_readonly(authority.pubkey(), false),
                AccountMeta::new(Pubkey::new_unique(), false),
            ],
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    assert_eq!(
        context
            .banks_client
            .process_transaction(transaction)
            .await
            .unwrap_err()
            .unwrap(),
        TransactionError::InstructionError(0, InstructionError::MissingRequiredSignature)
    );
}

//---------------------------------------------------------------------
// RECORD DYNAMIC implementation
async fn create_record_dynamic(
    context: &mut ProgramTestContext,
    authority: &Keypair,
    account: &Keypair,
    data: Vec<u8>,
) -> transport::Result<()> {

    // For this test, we are going to get the serialized data size
    // + add a buffer of 100 bytes in case we want to increase the current
    // size slightly in the future.
    // We will pass this value as the minimum rent size
    // and for the max size of the account (space)
    let data_buffer = 100; // bytes
    let serialized_data_vec = data.try_to_vec()?; 

    // get max account size : 
    // serialized data len + writeable start index + buffer estimate for expansion
    let max_account_size = serialized_data_vec.len() + 
        RecordDataDynamic::LEN + 
        data_buffer; 

    println!("\nserialized_data_vec: {:?}
            \nserialized_data_vec.len(): {:?}
            \nWRITABLE_START_INDEX: {:?}
            \ndata_buffer: {:?}
            \nmax_account_size: {:?}\n", 
            serialized_data_vec, 
            serialized_data_vec.len(),    
            RecordDataDynamic::LEN,        
            data_buffer, 
            max_account_size
    );

    let transaction = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &context.payer.pubkey(),
                &account.pubkey(),                
                1.max(Rent::default().minimum_balance(max_account_size)),      
                max_account_size as u64,          
                &id(),
            ),

            instruction::initialize_dynamic(&account.pubkey(), &authority.pubkey()),

            instruction::write_dynamic(
                &account.pubkey(),
                &authority.pubkey(),
                0,
                data,
            ),
        ],
        Some(&context.payer.pubkey()),
        &[&context.payer, account, authority],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(transaction).await
}

#[tokio::test]
async fn create_record_dynamic_success() {
    // create program test context
    let mut context = program_test().start_with_context().await;

    // Create keypairs for account and authority
    let authority = Keypair::new();
    let account = Keypair::new();        

    // Create test data and store the length (showing a conversion path)
    let original_data: String = "testing dynamic data".to_owned();
    let converted_data = original_data.as_bytes().to_vec();
    let data_len = converted_data.len();
    

    // call create record dynamic 
    create_record_dynamic(
        &mut context, 
        &authority, 
        &account, 
        converted_data
    ).await
     .unwrap();


    // Example: Get our header information (version, authority)
    // This is how we might normally get our record data header
    let record = RecordDataDynamic::unpack_from_slice(       
            &mut context.banks_client
            .get_account(account.pubkey())
            .await
            .unwrap()
            .unwrap()
            .data,
    )
    .unwrap();

    // Get all the account data so we can deserialize how we want
    let account_data = &mut context.banks_client
            .get_account(account.pubkey())
            .await
            .unwrap()
            .unwrap()
            .data;
    
    // deserialize header (we stored the header length in bytes, so from 0 .. len)
    let record_header = RecordDataDynamic::unpack_from_slice(&account_data[..RecordDataDynamic::LEN]).unwrap();
    println!("\n\nRecord Data Dynamic header: {:?}", record_header);

    // decode our test data: we know the type and size (starting from end of header.
    // we passed 100 bytes in when we created the account, and we only want to read as many as we need for our test data)
    // the length of our test data is stored above. we could have passe din the length only, if we only ever wanted to store this length
    // we passed in 100 in case we wanted to store a little more data.
    
    // choose appropriate decode method
    let record_data = str::from_utf8(&account_data[RecordDataDynamic::LEN..RecordDataDynamic::LEN+data_len]).unwrap();
    println!("\nRecord Data Dynamic: {:?} \n", record_data);

    // Test
    assert_eq!(original_data, record_data);
    assert_eq!(authority.pubkey(), record_header.authority);
    assert_eq!(RecordDataDynamic::CURRENT_VERSION, record_header.version);
}
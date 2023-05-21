//! Tests `#[derive(PrintProgramError)]`
//!
use spl_program_error::*;

/// Example error
#[derive(
    Clone,
    Debug,
    DecodeError,
    Eq,
    IntoProgramError,
    PrintProgramError,
    thiserror::Error,
    num_derive::FromPrimitive,
    PartialEq,
)]
pub enum ExampleError {
    /// Mint has no mint authority
    #[error("Mint has no mint authority")]
    MintHasNoMintAuthority,
    /// Incorrect mint authority has signed the instruction
    #[error("Incorrect mint authority has signed the instruction")]
    IncorrectMintAuthority,
}

/// Tests that all macros compile
#[test]
fn _test() {
    let _ = ExampleError::MintHasNoMintAuthority;
}

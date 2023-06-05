//! Crate defining a procedural macro for building Solana program errors

// Required to include `#[allow(clippy::integer_arithmetic)]`
// below since the tokens generated by `quote!` in the implementation
// for `MacroType::PrintProgramError` and `MacroType::SplProgramError`
// trigger the lint upstream through `quote_token_with_context` within the
// `quote` crate
//
// Culprate is `macro_impl.rs:66`
#![allow(clippy::integer_arithmetic)]
#![deny(missing_docs)]
#![cfg_attr(not(test), forbid(unsafe_code))]

extern crate proc_macro;

mod macro_impl;

use macro_impl::MacroType;
use proc_macro::TokenStream;
use syn::{parse_macro_input, ItemEnum};

/// Derive macro to add `Into<solana_program::program_error::ProgramError>` traits
#[proc_macro_derive(IntoProgramError)]
pub fn into_program_error(input: TokenStream) -> TokenStream {
    MacroType::IntoProgramError
        .generate_tokens(parse_macro_input!(input as ItemEnum))
        .into()
}

/// Derive macro to add `solana_program::decode_error::DecodeError` trait
#[proc_macro_derive(DecodeError)]
pub fn decode_error(input: TokenStream) -> TokenStream {
    MacroType::DecodeError
        .generate_tokens(parse_macro_input!(input as ItemEnum))
        .into()
}

/// Derive macro to add `solana_program::program_error::PrintProgramError` trait
#[proc_macro_derive(PrintProgramError)]
pub fn print_program_error(input: TokenStream) -> TokenStream {
    MacroType::PrintProgramError
        .generate_tokens(parse_macro_input!(input as ItemEnum))
        .into()
}

/// Proc macro attribute to turn your enum into a Solana Program Error
#[proc_macro_attribute]
pub fn spl_program_error(_: TokenStream, input: TokenStream) -> TokenStream {
    MacroType::SplProgramError
        .generate_tokens(parse_macro_input!(input as ItemEnum))
        .into()
}

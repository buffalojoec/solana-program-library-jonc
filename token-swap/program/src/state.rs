//! State transition types

use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};
use solana_sdk::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

/// Program states.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SwapInfo {
    /// Initialized state.
    pub is_initialized: bool,
    /// Nonce used in program address.
    /// The program address is created deterministically with the nonce,
    /// swap program id, and swap account pubkey.  This program address has
    /// authority over the swap's token A account, token B account, and pool
    /// token mint.
    pub nonce: u8,
    
    /// Program ID of the tokens being exchanged.
    pub token_program_id: Pubkey,

    /// Token A liquidity account
    pub token_a: Pubkey,
    /// Token B liquidity account
    pub token_b: Pubkey,
    /// Weight for token A, minimum of 1, maximum of 100
    pub weight_a: u8,
    /// Weight for token B, minimum of 1, maximum of 100
    pub weight_b: u8,
    /// Pool tokens are issued when A or B tokens are deposited.
    /// Pool tokens can be withdrawn back to the original A or B token.
    pub pool_mint: Pubkey,

    /// Numerator of fee applied to the input token amount prior to output calculation.
    pub fee_numerator: u64,
    /// Denominator of fee applied to the input token amount prior to output calculation.
    pub fee_denominator: u64,
}

impl Sealed for SwapInfo {}
impl IsInitialized for SwapInfo {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for SwapInfo {
    const LEN: usize = 148;

    /// Unpacks a byte buffer into a [SwapInfo](struct.SwapInfo.html).
    fn unpack_from_slice(input: &[u8]) -> Result<Self, ProgramError> {
        let input = array_ref![input, 0, 148];
        #[allow(clippy::ptr_offset_with_cast)]
        let (
            is_initialized,
            nonce,
            token_program_id,
            token_a,
            token_b,
            weight_a,
            weight_b,
            pool_mint,
            fee_numerator,
            fee_denominator,
        ) = array_refs![input, 1, 1, 32, 32, 32, 1, 1, 32, 8, 8];
        Ok(Self {
            is_initialized: match is_initialized {
                [0] => false,
                [1] => true,
                _ => return Err(ProgramError::InvalidAccountData),
            },
            nonce: nonce[0],
            token_program_id: Pubkey::new_from_array(*token_program_id),
            token_a: Pubkey::new_from_array(*token_a),
            token_b: Pubkey::new_from_array(*token_b),
            weight_a: weight_a[0],
            weight_b: weight_b[0],
            pool_mint: Pubkey::new_from_array(*pool_mint),
            fee_numerator: u64::from_le_bytes(*fee_numerator),
            fee_denominator: u64::from_le_bytes(*fee_denominator),
        })
    }

    fn pack_into_slice(&self, output: &mut [u8]) {
        let output = array_mut_ref![output, 0, 146];
        let (
            is_initialized,
            nonce,
            token_program_id,
            token_a,
            token_b,
            weight_a,
            weight_b,
            pool_mint,
            fee_numerator,
            fee_denominator,
        ) = mut_array_refs![output, 1, 1, 32, 32, 32, 1, 1, 32, 8, 8];
        is_initialized[0] = self.is_initialized as u8;
        nonce[0] = self.nonce;
        token_program_id.copy_from_slice(self.token_program_id.as_ref());
        token_a.copy_from_slice(self.token_a.as_ref());
        token_b.copy_from_slice(self.token_b.as_ref());
        weight_a[0] = self.weight_a;
        weight_b[0] = self.weight_b;
        pool_mint.copy_from_slice(self.pool_mint.as_ref());
        *fee_numerator = self.fee_numerator.to_le_bytes();
        *fee_denominator = self.fee_denominator.to_le_bytes();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swap_info_packing() {
        let nonce = 255;
        let token_program_id_raw = [1u8; 32];
        let token_a_raw = [1u8; 32];
        let token_b_raw = [2u8; 32];
        let pool_mint_raw = [3u8; 32];
        let token_program_id = Pubkey::new_from_array(token_program_id_raw);
        let token_a = Pubkey::new_from_array(token_a_raw);
        let token_b = Pubkey::new_from_array(token_b_raw);
        let weight_a = 2;
        let weight_b = 90;
        let pool_mint = Pubkey::new_from_array(pool_mint_raw);
        let fee_numerator = 1;
        let fee_denominator = 4;
        let is_initialized = true;
        let swap_info = SwapInfo {
            is_initialized,
            nonce,
            token_program_id,
            token_a,
            token_b,
            weight_a,
            weight_b,
            pool_mint,
            fee_numerator,
            fee_denominator,
        };

        let mut packed = [0u8; SwapInfo::LEN];
        SwapInfo::pack(swap_info, &mut packed).unwrap();
        let unpacked = SwapInfo::unpack(&packed).unwrap();
        assert_eq!(swap_info, unpacked);

        let mut packed = vec![];
        packed.push(1 as u8);
        packed.push(nonce);
        packed.extend_from_slice(&token_program_id_raw);
        packed.extend_from_slice(&token_a_raw);
        packed.extend_from_slice(&token_b_raw);
        packed.push(weight_a);
        packed.push(weight_b);
        packed.extend_from_slice(&pool_mint_raw);
        packed.push(fee_numerator as u8);
        packed.extend_from_slice(&[0u8; 7]); // padding
        packed.push(fee_denominator as u8);
        packed.extend_from_slice(&[0u8; 7]); // padding
        let unpacked = SwapInfo::unpack(&packed).unwrap();
        assert_eq!(swap_info, unpacked);

        let packed = [0u8; SwapInfo::LEN];
        let swap_info: SwapInfo = Default::default();
        let unpack_unchecked = SwapInfo::unpack_unchecked(&packed).unwrap();
        assert_eq!(unpack_unchecked, swap_info);
        let err = SwapInfo::unpack(&packed).unwrap_err();
        assert_eq!(err, ProgramError::UninitializedAccount);
    }
}

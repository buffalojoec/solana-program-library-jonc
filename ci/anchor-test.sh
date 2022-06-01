#!/usr/bin/env bash
#
# Builds known downstream Anchor projects against local SPL source
#

set -e
cd "$(dirname "$0")"/..
spl_dir=$PWD
source ./ci/patch-crates.sh
source ./ci/read-cargo-variable.sh
source ./ci/rust-version.sh stable
source ./ci/solana-version.sh

solana_version=${solana_version#v}
spl_associated_token_account_version=$(readCargoVariable version "$spl_dir"/associated-token-account/program/Cargo.toml)
spl_memo_version=$(readCargoVariable version "$spl_dir"/memo/program/Cargo.toml)
spl_token_version=$(readCargoVariable version "$spl_dir"/token/program/Cargo.toml)
spl_token_2022_version=$(readCargoVariable version "$spl_dir"/token/program-2022/Cargo.toml)

downstream_dir="$spl_dir"/target/downstream-projects-anchor
mkdir -p "$downstream_dir"
cd "$downstream_dir"

anchor_dir="$downstream_dir"/anchor
metaplex_dir="$downstream_dir"/metaplex-program-library

# NOTE This isn't run in a subshell to get $anchor_version
setup_anchor() {
  set -x
  cd "$downstream_dir"
  rm -rf anchor
  git clone https://github.com/project-serum/anchor.git
  cd "$anchor_dir"

  "$spl_dir"/update-solana-dependencies.sh "$solana_version" .
  update_dependency . spl-associated-token-account "$spl_associated_token_account_version"
  update_dependency . spl-memo "$spl_memo_version"
  update_dependency . spl-token "$spl_token_version"
  update_dependency . spl-token-2022 "$spl_token_2022_version"
  patch_crates_io_spl Cargo.toml "$spl_dir"
  patch_crates_io_metaplex Cargo.toml "$metaplex_dir"

  anchor_version=$(readCargoVariable version "$anchor_dir"/lang/Cargo.toml)
}

mango() {
  (
    set -x
    rm -rf mango-v3
    git clone https://github.com/blockworks-foundation/mango-v3
    cd mango-v3

    "$spl_dir"/update-solana-dependencies.sh "$solana_version" .
    update_anchor_dependencies . "$anchor_version"
    update_dependency . spl-associated-token-account "$spl_associated_token_account_version"
    update_dependency . spl-memo "$spl_memo_version"
    update_dependency . spl-token "$spl_token_version"
    update_dependency . spl-token-2022 "$spl_token_2022_version"
    patch_crates_io_spl Cargo.toml "$spl_dir"
    patch_crates_io_anchor Cargo.toml "$anchor_dir"

    test_in_dir .
  )
}

setup_metaplex() {
  (
    set -x
    cd "$downstream_dir"
    rm -rf metaplex-program-library
    git clone https://github.com/metaplex-foundation/metaplex-program-library
    cd "$metaplex_dir"

    "$spl_dir"/update-solana-dependencies.sh "$solana_version" .
    update_anchor_dependencies . "$anchor_version"
    update_dependency . spl-associated-token-account "$spl_associated_token_account_version"
    update_dependency . spl-memo "$spl_memo_version"
    update_dependency . spl-token "$spl_token_version"
    update_dependency . spl-token-2022 "$spl_token_2022_version"
    patch_crates_io_spl Cargo.toml "$spl_dir"
    patch_crates_io_anchor Cargo.toml "$anchor_dir"
  )
}

test_in_dir() {
  declare test_dir="$1"
  (
    cd "$test_dir"
    cargo build
    cargo test
    cargo test-bpf
  )
}

setup_anchor
setup_metaplex

#test_in_dir "$metaplex_dir"/token-metadata/program
#test_in_dir "$anchor_dir"
#mango

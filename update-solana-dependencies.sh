#!/usr/bin/env bash
#
# Updates the solana version in all the SPL crates
#

solana_ver=$1
if [[ -z $solana_ver ]]; then
  echo "Usage: $0 <new-solana-version> [<update-directory>]"
  exit 1
fi

base_dir="$(dirname "$0")"
update_dir=$2
if [[ -z $update_dir ]]; then
  update_dir=$base_dir
fi

cd "$base_dir"
source ./ci/solana-version.sh
old_solana_ver=${solana_version#v}

sed -i'' -e "s#solana_version=v.*#solana_version=v${solana_ver}#" "$update_dir"/ci/solana-version.sh
sed -i'' -e "s#solana_version = \".*\"#solana_version = \"${solana_ver}\"#" "$update_dir"/Anchor.toml

declare tomls=()
while IFS='' read -r line; do tomls+=("$line"); done < <(find "$update_dir" -name Cargo.toml)

crates=(
  solana-account-decoder
  solana-banks-client
  solana-banks-server
  solana-bpf-loader-program
  solana-clap-utils
  solana-cli-config
  solana-cli-output
  solana-client
  solana-core
  solana-logger
  solana-notifier
  solana-program
  solana-program-test
  solana-remote-wallet
  solana-runtime
  solana-sdk
  solana-stake-program
  solana-test-validator
  solana-transaction-status
  solana-vote-program
  solana-version
  solana-zk-token-sdk
)

set -x
for crate in "${crates[@]}"; do
  sed -E -i'' -e "s:(${crate} = \")(=?)${old_solana_ver}\".*:\1\2${solana_ver}\":" "${tomls[@]}"
done

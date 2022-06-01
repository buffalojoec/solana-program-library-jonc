# source this file

update_dependency() {
  declare project_root="$1"
  declare package_name="$2"
  declare version="$3"
  declare tomls=()
  while IFS='' read -r line; do tomls+=("$line"); done < <(find "$project_root" -name Cargo.toml)

  sed -i -e "s#\($package_name\s*=\s*\"\).*\(\"\)#\1=$version\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\($package_name\s*=\s*{\s*version\s*=\s*\"\)[^\"]*\(\"\)#\1=$version\2#g" "${tomls[@]}" || return $?
}

update_anchor_dependencies() {
  declare project_root="$1"
  declare anchor_version="$2"
  declare tomls=()
  while IFS='' read -r line; do tomls+=("$line"); done < <(find "$project_root" -name Cargo.toml)

  sed -i -e "s#\(anchor-lang\s*=\s*\"\)[^\"]*\(\"\)#\1=$anchor_version\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(anchor-spl\s*=\s*\"\)[^\"]*\(\"\)#\1=$anchor_version\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(anchor-lang\s*=\s*{\s*version\s*=\s*\"\)[^\"]*\(\"\)#\1=$anchor_version\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(anchor-spl\s*=\s*{\s*version\s*=\s*\"\)[^\"]*\(\"\)#\1=$anchor_version\2#g" "${tomls[@]}" || return $?
}

patch_crates_io_spl() {
  declare Cargo_toml="$1"
  declare spl_dir="$2"
  cat >> "$Cargo_toml" <<EOF
[patch.crates-io]
spl-associated-token-account = { path = "$spl_dir/associated-token-account/program" }
spl-memo = { path = "$spl_dir/memo/program" }
spl-token = { path = "$spl_dir/token/program" }
spl-token-2022 = { path = "$spl_dir/token/program-2022" }
EOF
}

patch_crates_io_anchor() {
  declare Cargo_toml="$1"
  declare anchor_dir="$2"
  cat >> "$Cargo_toml" <<EOF
anchor-lang = { path = "$anchor_dir/lang" }
anchor-spl = { path = "$anchor_dir/spl" }
EOF
}

patch_crates_io_metaplex() {
  declare Cargo_toml="$1"
  declare metaplex_dir="$2"
  cat >> "$Cargo_toml" <<EOF
mpl-token-metadata = { path = "$metaplex_dir/token-metadata/program" }
mpl-token-vault = { path = "$metaplex_dir/token-vault/program" }
EOF
}

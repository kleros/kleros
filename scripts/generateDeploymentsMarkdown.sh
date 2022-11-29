#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

function generate() { #deploymentDir #explorerUrl
    deploymentDir=$1
    explorerUrl=$2
    for f in $(ls -1 $deploymentDir/*.json); do
        contractName=$(basename $f .json)
        address=$(cat $f | jq -r .address)
        echo "- [$contractName]($explorerUrl$address)"
    done
}

echo "#### Mainnet"
echo
echo "- [PNK](https://etherscan.io/address/0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d)"
generate "$SCRIPT_DIR/../deployments/mainnet" "https://etherscan.io/address/"
echo
echo "#### Goerli"
echo
echo "- [PNK](https://goerli.etherscan.io/token/0xA3B02bA6E10F55fb177637917B1b472da0110CcC)"
generate "$SCRIPT_DIR/../deployments/goerli" "https://goerli.etherscan.io/address/"
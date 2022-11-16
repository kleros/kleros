import { ethers } from 'hardhat';

export const getCurrentTimestamp = async () =>
  (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
    .timestamp;

export const increaseTime = async (amount: number) =>
  await ethers.provider.send('evm_mine', [
    (await getCurrentTimestamp()) + amount,
  ]);

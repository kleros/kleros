import { BigNumber, BigNumberish, ContractFunction } from 'ethers';
import { ethers } from 'hardhat';
import { PromiseOrValue } from '../typechain-types/common';

export const getCurrentTimestamp = async () =>
  (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
    .timestamp;

export const increaseTime = async (amount: number) =>
  await ethers.provider.send('evm_mine', [
    (await getCurrentTimestamp()) + amount,
  ]);

export const asyncForEach = async function<F extends ContractFunction>(
  method: F,
  iterable: { [s: string]: unknown } | ArrayLike<unknown>
): Promise<void> {
  const array = Array.isArray(iterable) ? iterable : Object.values(iterable);
  for (const arg of array) await method(arg);
};

export const generateSubcourts = (
  depth: number,
  ID = 0,
  args: {
    minStake: number;
    alpha: number;
    feeForJuror: BigNumber | number;
    jurorsForCourtJump: number;
    timesPerPeriod: PromiseOrValue<BigNumberish>[];
    sortitionSumTreeK: number;
  },
  subcourtMap = {}
) => {
  const {
    minStake,
    alpha,
    feeForJuror,
    jurorsForCourtJump,
    timesPerPeriod,
    sortitionSumTreeK,
  } = args;
  const subcourtTree = {
    ID,
    children:
      depth > 1
        ? [...new Array(sortitionSumTreeK)].map(
            (_, i) =>
              generateSubcourts(
                depth - 1,
                sortitionSumTreeK * ID + i + 1,
                {
                  minStake,
                  alpha,
                  feeForJuror,
                  jurorsForCourtJump,
                  timesPerPeriod,
                  sortitionSumTreeK,
                },
                subcourtMap
              ).subcourtTree
          )
        : undefined,
    hiddenVotes: ID % 2 === 0,
    minStake,
    alpha,
    feeForJuror,
    jurorsForCourtJump,
    timesPerPeriod,
    sortitionSumTreeK,
  };
  if (ID === 0) subcourtTree.parent = 0;
  else {
    subcourtTree.parent = Math.floor((ID - 1) / sortitionSumTreeK);
    subcourtMap[subcourtTree.ID] = {
      ...subcourtTree,
      children:
        subcourtTree.children &&
        subcourtTree.children.map((child: { ID: any }) => child.ID),
    };
  }
  return { subcourtMap, subcourtTree };
};

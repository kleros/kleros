import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish, Contract, ContractFunction, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import { MiniMeTokenERC20 } from "typechain-types";
import { PromiseOrValue } from "typechain-types/common";

export const getCurrentTimestamp = async () =>
  (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

export const increaseTime = async (amount: number) =>
  await ethers.provider.send("evm_mine", [(await getCurrentTimestamp()) + amount]);

export const asyncForEach = async function <F extends ContractFunction>(
  method: F,
  iterable: { [s: string]: unknown } | ArrayLike<unknown>
): Promise<void> {
  const array = Array.isArray(iterable) ? iterable : Object.values(iterable);
  for (const arg of array) await method(arg);
};

export const generageExtradata = (subcourtID: number, numberOfJurors: number) =>
  `0x${subcourtID.toString(16).padStart(64, "0")}${numberOfJurors.toString(16).padStart(64, "0")}`;

export const generateSubcourts = (
  depth: number,
  ID = 0,
  args: {
    minStake: BigNumber | number;
    alpha: number;
    feeForJuror: BigNumber | number;
    jurorsForCourtJump: number;
    timesPerPeriod: PromiseOrValue<BigNumberish>[];
    sortitionSumTreeK: number;
  },
  subcourtMap = {}
) => {
  const { minStake, alpha, feeForJuror, jurorsForCourtJump, timesPerPeriod, sortitionSumTreeK } = args;
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
      children: subcourtTree.children && subcourtTree.children.map((child: { ID: any }) => child.ID),
    };
  }
  return { subcourtMap, subcourtTree };
};

export const getVoteIDs = async (tx: ContractTransaction) => {
  const voteIDs = new Map<string, number>();

  const receipt = await tx.wait();
  const args = receipt.events?.map((event) => event.args);
  args?.forEach((item, index) => voteIDs.set(item?._address, index));
  return voteIDs;
};

export const getRandomNumber = (maxNumber: number): number => {
  return ethers.BigNumber.from(ethers.utils.randomBytes(32)).mod(maxNumber).toNumber();
};

export const getJurorsBalances = async (
  drawnJurors: string[],
  balanceChecker: JsonRpcProvider | MiniMeTokenERC20
): Promise<Map<string, BigNumber>> => {
  const jurorsBalances = new Map<string, BigNumber>();

  for (const juror of drawnJurors) {
    if (isERC20(balanceChecker)) {
      jurorsBalances.set(juror, (await balanceChecker?.balanceOf(juror)) as BigNumber);
    } else {
      jurorsBalances.set(juror, (await balanceChecker?.getBalance(juror)) as BigNumber);
    }
  }

  return jurorsBalances;
};

const isERC20 = (obj: any): obj is MiniMeTokenERC20 => {
  return "balanceOf" in obj;
};

export const execute = async <C extends Contract, F extends keyof C>(
  contract: C,
  method: string,
  value: BigNumber,
  singer: SignerWithAddress,
  _args?: Parameters<C[F]>,
  _gasPrice?: BigNumber
) => {
  const gasPrice = _gasPrice || 1000000000;
  const tx = _args
    ? await contract.connect(singer)[method](..._args, {
        gasPrice,
        value,
      })
    : await contract.connect(singer)[method]({
        gasPrice,
        value,
      });
  const receipt = await tx.wait();
  return receipt.gasUsed.mul(gasPrice);
};

import { ethers } from 'hardhat';
import { expect } from 'chai';
import { PolicyRegistry } from '../../typechain-types';

describe('PolicyRegistry', () =>
  it('Should allow setting subcourt policies.', async () => {
    const [deployer, governor] = await ethers.getSigners();
    const subcourtID = 0;

    const PolicyRegistry = await ethers.getContractFactory(
      'PolicyRegistry',
      deployer
    );
    const policyRegistry = (await PolicyRegistry.deploy(
      governor.address
    )) as PolicyRegistry;

    const policies = [
      'https://a.b.com',
      'https://c.d.com',
      'https://e.f.com',
      'https://g.h.com',
    ];

    // Verify policy update events were emitted.
    for (const policy of policies)
      await expect(
        policyRegistry.connect(governor).setPolicy(subcourtID, policy)
      )
        .to.emit(policyRegistry, 'PolicyUpdate')
        .withArgs(subcourtID, policy);

    // Verify the last policy is set.
    const lastPolicy = policies[policies.length - 1];
    const policy = await policyRegistry.policies(subcourtID);
    expect(policy).to.equal(lastPolicy);
  }));

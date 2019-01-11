/* globals artifacts, contract, expect */
const PolicyRegistry = artifacts.require('./kleros/PolicyRegistry.sol')

contract('PolicyRegistry', accounts =>
  it('Should let you set subcourt policies.', async () => {
    // Deploy contract and generate policies.
    const governor = accounts[0]
    const subcourtID = 0
    const policyRegistry = await PolicyRegistry.new(governor)
    const policies = [
      'https://a.b.com',
      'https://c.d.com',
      'https://e.f.com',
      'https://g.h.com'
    ]

    // Set policies.
    for (const policy of policies)
      await policyRegistry.setPolicy(subcourtID, policy)

    // Verify policy update events were emitted.
    expect(
      (await new Promise((resolve, reject) =>
        policyRegistry
          .PolicyUpdate({ _subcourtID: subcourtID }, { fromBlock: 0 })
          .get((err, logs) => (err ? reject(err) : resolve(logs)))
      )).map(e => e.args._policy)
    ).to.deep.equal(['', ...policies.slice(0, policies.length - 1)])

    // Verify the last policy is set.
    const lastPolicy = policies[policies.length - 1]
    const policy = await policyRegistry.policies(subcourtID)
    expect(policy).to.equal(lastPolicy)
  })
)

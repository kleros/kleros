const { expectThrow, waitForMined, increaseTime } = require('kleros-interaction/helpers/utils')
const KlerosPOC = artifacts.require('./KlerosPOC.sol')
const Pinakion = artifacts.require('./PinakionPOC.sol')
const ArbitrableTransaction = artifacts.require('kleros-interaction/ArbitrableTransaction.sol')
const ConstantRandom = artifacts.require('kleros-interaction/ConstantNG.sol')


contract('KlerosPOC', function(accounts) {
    
    let creator = accounts[0]
    let jurorA  = accounts[1]
    let jurorB  = accounts[2]
    let jurorC  = accounts[3]
    let other   = accounts[4]
    let payer   = accounts[5]
    let payee   = accounts[6]

    
    // Constructor
    it("Should create the contract with the initial values", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[2,4,8,2,5],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.pinakion(), pinakion.address, "The PNK address did not setup properly.")
        assert.equal(await klerosPOC.rng(), rng.address, "The RNG address did not setup properly.")
        assert.equal(await klerosPOC.timePerPeriod(2), 8, "The time period did not setup properly.")
    })
    
    // **************************** //
    // *  Functions interacting   * //
    // *  with Pinakion contract  * //
    // **************************** //
    
    // deposit TODO
    it("Should deposit tokens to the contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        await pinakion.deposit(0.4e18,{from:jurorA})

        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.6e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)).toNumber(), 0.4e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    // withdraw
    it("Should decrease the balance in the kleros contract and increase it in the pinakion contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 0.2e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)), 0.8e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    it("Should not be possible to withdraw more than what we have", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        
        await expectThrow(klerosPOC.withdraw(1.8e18,{from:jurorA}))
    })
    
    // buyPinakion
    it("Should increase the balance of the juror", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})     
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 1e18, "The juror don't have the correct amount of PNK in Kleros.")
    })
    
    // **************************** //
    // *      Court functions     * //
    // **************************** //
    
    // passPeriod
    it("Should be able to pass all periods when the time has passed but not before", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[20,0,80,20,50],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.period(), 0)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(11)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 1)
        
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 2)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(71)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 3)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(11)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 4)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(41)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 0)
        assert.equal(await klerosPOC.session(), 2)
    })
    
    // activateTokens
    it("Should activate the tokens and compute the segments correctly", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.buyPinakion({from:jurorB,value:1.4e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        assert.equal((await klerosPOC.jurors(jurorA))[2], 1, "The juror A lastSession is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[3], 0, "The juror A start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[4], 1.2e18, "The juror A end segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[3], 1.2e18, "The juror B start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[4], 2.6e18, "The juror B end segment is incorrect.")
        assert.equal(await klerosPOC.segmentSize(), 2.6e18, "The segment size is incorrect.")
    })
    
    it("Should activate the tokens and compute the segments correctly at the second session", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.buyPinakion({from:jurorB,value:1.4e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        for (let i = 0; i < 5; i++) 
            await klerosPOC.passPeriod({from:other})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        assert.equal((await klerosPOC.jurors(jurorA))[2], 2, "The juror A lastSession is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[3], 0, "The juror A start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[4], 1.2e18, "The juror A end segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[3], 1.2e18, "The juror B start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[4], 2.6e18, "The juror B end segment is incorrect.")
        assert.equal(await klerosPOC.segmentSize(), 2.6e18, "The segment size is incorrect.")
        
    })
    
    it("Should not be possible to activate too much", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await expectThrow(klerosPOC.activateTokens(1.3e18,{from:jurorA}))
    })
    
    it("Should not be possible to activate outside activation period", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.activateTokens(1.2e18,{from:jurorA}))
    })
    
    it("Should not be possible to activate multiple times", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await expectThrow(klerosPOC.activateTokens(1.2e18,{from:jurorA}))
    })
    
    // voteRuling
    it("Should put the correct number of tokens at stake", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        await klerosPOC.voteRuling(0, 1, [1,2,3],{from:jurorA})
        
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)
        assert.equal((await klerosPOC.jurors(jurorA))[1], 3*stakePerWeight, "The amount of token at stake is incorrect.")
    })
    
    it("Should not be possible to vote with extra weight (single juror case)", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        await expectThrow(klerosPOC.voteRuling(0, 1, [1,2,3,4],{from:jurorA}))
    })
    
})



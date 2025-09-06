import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("OracleLibrary (wrapper)", function () {
    let tester: Contract;

    before(async function () {
        const Tester = await ethers.getContractFactory("OracleLibraryTester");
        tester = await Tester.deploy();
    });

    it("initialize sets cardinality and cardinalityNext", async function () {
        await tester.initialize(1000);
        expect(Number(await tester.cardinality())).to.equal(1);
        expect(Number(await tester.cardinalityNext())).to.equal(1);
    });

    it("grow increases cardinalityNext", async function () {
        await tester.initialize(1000);
        await tester.grow(10);
        expect(Number(await tester.cardinalityNext())).to.equal(10);
    });

    it("write updates index and marks observation initialized", async function () {
        await tester.initialize(1000);
        await tester.grow(5);
        await tester.write(1010, 0, 1000);
        const idx = await tester.index();
        const obs = await tester.getObservation(Number(idx));
        expect(Number(obs[0])).to.equal(1010); // blockTimestamp
        expect(Number(obs[1])).to.equal(0);    // tickCumulative delta for first write is 0
        expect(Boolean(obs[3])).to.equal(true); // initialized
    });
}); 
/*global describe, it*/
const {assert} = require('chai');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');

const ContractSources = require('../lib/modules/coverage/contractSources');
const ContractSource = require('../lib/modules/coverage/contractSource');
const SourceMap = require('../lib/modules/coverage/sourceMap');

function fixturePath(fixture) {
  return path.join(__dirname, 'fixtures', fixture);
}

function loadFixture(fixture) {
  return fs.readFileSync(fixturePath(fixture)).toString();
}

describe('ContractSources', () => {
  describe('constructor', () => {
    it('should read files and create instances of ContractSource', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources([contractPath]);
      assert.instanceOf(cs.files['cont.sol'], ContractSource);

      done();
    });

    it('should work when a single path is passed', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);
      assert.instanceOf(cs.files['cont.sol'], ContractSource);

      done();
    });

    it('should throw an error when the file does not exist', (done) => {
      assert.throws(() => {
        new ContractSources(['fixtures/404.sol']);
      }, /ENOENT: no such file or directory, open/);

      done();
    });
  });

  describe('#toSolcInputs', () => {
    it('should build the hash in the format that solc likes', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources([contractPath]);
      assert.deepEqual({
        'cont.sol': {content: cs.files['cont.sol'].body}
      }, cs.toSolcInputs());
      done();
    });
  });

  describe('#parseSolcOutput', () => {
    it('should send the output to each of the ContractSource instances', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources([contractPath]);

      var parseSolcOutputSpy = sinon.spy(cs.files['cont.sol'], 'parseSolcOutput');
      const solcOutput = JSON.parse(loadFixture('solc-output.json'));
      cs.parseSolcOutput(solcOutput);

      assert(parseSolcOutputSpy.calledOnce);
      done();
    });
  });
});

describe('ContractSource', () => {
  const contractSource = `
pragma solidity ^0.4.24;

contract x {
  int number;
  string name;

  constructor(string _name)
  public
  {
    name = _name;
  }

  function g(int _number)
  public
  returns (int _multiplication)
  {
    number = _number;
    return _number * 5;
  }

  function f(int _foo, int _bar)
  public
  pure
  returns (int _addition)
  {
    return _foo + _bar;
  }

  function h(int _bar)
  public
  pure
  returns (bool _great)
  {
    if(_bar > 25) {
      return true;
    } else {
      return false;
    }
  }
}
  `.trim();

  const cs = new ContractSource('contract.sol', '/tmp/contract.sol', contractSource);

  describe('constructor', () => {
    it('should set line offsets and line lengths correctly', (done) => {
      // +1 here accounts for a newline
      assert.equal("pragma solidity ^0.4.24;".length + 1, cs.lineOffsets[1]);
      done();
    });
  });

  describe('#sourceMapToLocations', () => {
    it('should return objects that indicate start and end location and columns', (done) => {
      // constructor function
      var loc = cs.sourceMapToLocations('71:60:0');
      assert.deepEqual({line: 7, column: 2}, loc.start);
      assert.deepEqual({line: 11, column: 3}, loc.end);

      // f function
      loc = cs.sourceMapToLocations('257:104:0');
      assert.deepEqual({line: 21, column: 2}, loc.start);
      assert.deepEqual({line: 27, column: 3}, loc.end);

      // g function
      loc = cs.sourceMapToLocations('135:118:0');
      assert.deepEqual({line: 13, column: 2}, loc.start);
      assert.deepEqual({line: 19, column: 3}, loc.end);

      done();
    });
  });

  describe('#parseSolcOutput', () => {
    it('should parse the deployed bytecode output correctly', (done) => {
      var solcOutput = JSON.parse(loadFixture('solc-output.json'));
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);
      cs.parseSolcOutput(solcOutput);

      var contractSource = cs.files['cont.sol'];

      assert.isNotEmpty(contractSource.contractDeployedBytecode);
      assert.isNotEmpty(contractSource.contractDeployedBytecode['x']);

      var bytecode = contractSource.contractDeployedBytecode['x'];

      assert.deepEqual({instruction: 'PUSH1', sourceMap: {offset: 26, length: 487, id: 0, jump: '-'}, jump: '-', seen: false}, bytecode[0]);
      assert.deepEqual({instruction: 'PUSH1', sourceMap: SourceMap.empty(), seen: false, jump: undefined}, bytecode[2]);
      assert.deepEqual({instruction: 'MSTORE', sourceMap: SourceMap.empty(), seen: false, jump: undefined}, bytecode[4]);
      assert.deepEqual({instruction: 'PUSH1', sourceMap: SourceMap.empty(), seen: false, jump: undefined}, bytecode[5]);

      done();
    });
  });

  describe('#parseSolcOutput', () => {
    it('should parse the bytecode output correctly', (done) => {
      var solcOutput = JSON.parse(loadFixture('solc-output.json'));
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);
      cs.parseSolcOutput(solcOutput);

      var contractSource = cs.files['cont.sol'];

      assert.isNotEmpty(contractSource.contractBytecode);
      assert.isNotEmpty(contractSource.contractBytecode['x']);

      var bytecode = contractSource.contractBytecode['x'];

      assert.deepEqual({instruction: 'PUSH1', sourceMap: {offset: 26, length: 487, id: 0, jump: '-'}, jump: '-', seen: false}, bytecode[0]);
      assert.deepEqual({instruction: 'PUSH1', sourceMap: SourceMap.empty(), seen: false, jump: undefined}, bytecode[2]);
      assert.deepEqual({instruction: 'MSTORE', sourceMap: SourceMap.empty(), seen: false, jump: undefined}, bytecode[4]);
      assert.deepEqual({instruction: 'CALLVALUE', sourceMap: {offset: 71, length: 60, jump: undefined}, seen: false, jump: undefined}, bytecode[5]);

      done();
    });
  });

  describe('#generateCodeCoverage', () => {
    it('should return an error when solc output was not parsed', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);
      var contractSource = cs.files['cont.sol'];
      var trace = JSON.parse(loadFixture('geth-debugtrace-output-g.json'));

      assert.throws(() => {
        contractSource.generateCodeCoverage(trace);
      }, 'Error generating coverage: solc output was not assigned');

      done();
    });

    it('should return a coverage report when solc output was parsed', (done) => {
      var solcOutput = JSON.parse(loadFixture('solc-output.json'));
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);
      cs.parseSolcOutput(solcOutput);

      var trace = JSON.parse(loadFixture('geth-debugtrace-output-h-5.json'));
      var coverage = cs.generateCodeCoverage(trace);
      assert.exists(coverage);

      done();
    });

    it('should merge coverages as we add more traces', (done) => {
      const contractPath = fixturePath('cont.sol');
      var cs = new ContractSources(contractPath);

      const solcOutput = JSON.parse(loadFixture('solc-output.json'));
      cs.parseSolcOutput(solcOutput);

      var trace = JSON.parse(loadFixture('geth-debugtrace-output-h-5.json'));
      cs.generateCodeCoverage(trace);

      trace = JSON.parse(loadFixture('geth-debugtrace-output-h-50.json'));
      var coverage = cs.generateCodeCoverage(trace)['cont.sol'];

      // In the fixture, the branch has an ID of 61, and the function has the
      // ID of 63
      assert.deepEqual([1,0], coverage.b['61']);
      assert.equal(6, coverage.f['63']);

      done();
    });
  });
});

describe('SourceMap', () => {
  describe('#subtract', () => {
    it('should return the correct values', (done) => {
      var sm1 = new SourceMap('365:146:0');
      var sm2 = new SourceMap('428:83:0');

      var result = sm1.subtract(sm2);

      assert.equal(365, result.offset);
      assert.equal(63, result.length);

      done();
    });
  });

  describe('#createRelativeTo', () => {
    it('should return an empty source map on an empty string', (done) => {
      var sm1 = new SourceMap('192:10:0');
      var sm2 = sm1.createRelativeTo('');

      assert.equal('', sm2.toString());

      done();
    });

    it('should return the correct source map on a relative string', (done) => {
      var sm1 = new SourceMap('192:10:0');
      var sm2 = sm1.createRelativeTo(':14');

      assert.equal(192, sm2.offset);
      assert.equal(14, sm2.length);
      assert.equal(0, sm2.id);

      done();
    });
  });
});

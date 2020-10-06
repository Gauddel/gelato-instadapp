pragma solidity ^0.6.10;

import "./Convertion.sol";

interface InstaMcdAddress {
    function manager() external view returns (address);
    function vat() external view returns (address);
    function jug() external view returns (address);
    function spot() external view returns (address);
    function pot() external view returns (address);
    function getCdps() external view returns (address);
}

interface JugLike {
    function ilks(bytes32) external view returns (uint, uint);
    function base() external view returns (uint);
}

contract MakerDAOStabilityFee is Convertion {

    bool mockMode;
    uint adjustmentValue;

    constructor() public {
        mockMode = false;
    }

    function getMcdAddresses() public pure returns (address) {
        return 0xF23196DF1C440345DE07feFbe556a5eF0dcD29F0;
    }

    // Seconds Stability fee rate
    function getFee(bytes32 ilk) public view returns (uint fee) {
        address jug = InstaMcdAddress(getMcdAddresses()).jug();
        (uint duty,) = JugLike(jug).ilks(ilk);
        uint base = JugLike(jug).base();
        fee = sub(add(duty, base), 1e27);
    }

    // Annual Stability fee rate
    function getAnnualFee(bytes32 ilk) external view returns (uint fee) {
        fee = convertSecondsRateToAnnualRate(getFee(ilk));
        if(mockMode) {
            fee = add(fee, adjustmentValue);
        }
    }

    function mock(bool _mockMode, uint _adjustmentValue) public {
        mockMode = _mockMode;
        adjustmentValue = _adjustmentValue;
    }
}
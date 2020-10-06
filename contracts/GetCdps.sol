pragma solidity ^0.6.10;

interface GetCdps {
    function getCdpsAsc(address manager, address guy) external view returns (uint[] memory ids, address[] memory urns, bytes32[] memory ilks);

    function getCdpsDesc( address manager, address guy) external view returns (uint[] memory ids, address[] memory urns, bytes32[] memory ilks);
}
import assert from "assert";
import AWSMock from 'aws-sdk-mock';
import AWS, { AWSError } from 'aws-sdk';
import { DescribePrefixListsRequest, ModifyManagedPrefixListRequest } from 'aws-sdk/clients/ec2';
import sinon from "sinon"

import PendingStateEventMock from "./mocks/pendingEvent.json";
import InvalidEventMock from "./mocks/invalidStatusEvent.json";
import StoppedStateEventMock from "./mocks/stoppedEvent.json";

import { __test__ } from "../lambda/index";

/* Local tests */
describe("Lamdba handler", () => {
  beforeEach(() => {
    AWSMock.setSDKInstance(AWS);
    AWSMock.restore("EC2");
  });

  describe("ensureEventIsValid", () => {
    const ensureEventIsValid = __test__.ensureEventIsValid
    it("must throw if event is not valid", async () => {
      assert.throws(() => ensureEventIsValid(InvalidEventMock), Error);
    });

    it("must not throw if event is valid", async () => {
      assert.doesNotThrow(() => ensureEventIsValid(StoppedStateEventMock), Error);
    });
  })

  describe("fetchPrefixList", () => {
    const fetchPrefixList = __test__.fetchPrefixList
    it("must return a prefixList when found", async () => {
      const prefixListId = "id"
      const version = 1
      const expectedResult = { id: prefixListId, version: version }
      AWSMock.mock('EC2', 'describeManagedPrefixLists', (_params: DescribePrefixListsRequest, callback: Function) => {
        callback(null, { PrefixLists: [{ PrefixListId: prefixListId, Version: version }] });
      })

      const result = await fetchPrefixList(prefixListId);
      assert.deepStrictEqual(result, expectedResult)
    });

    it("must throw when prefixList is not found", async () => {
      const prefixListId = "id"
      AWSMock.mock('EC2', 'describeManagedPrefixLists', (_params: DescribePrefixListsRequest, callback: Function) => {
        callback(null, { PrefixLists: [] });
      })

      assert.rejects(async () => await fetchPrefixList(prefixListId), Error);
    });
  })

  describe("fetchCidr", () => {
    const fetchCidr = __test__.fetchCidr
    it("must return formatted CIDR", async () => {
      assert.strictEqual(fetchCidr(PendingStateEventMock), "10.0.2.67/32")
    });
  })

  describe("formatParams", () => {
    const formatParams = __test__.formatParams
    it("must return formatted params for pending status event", async () => {
      const version = 1
      const prefixListId = "id"
      const expectedParams = {
        PrefixListId: prefixListId,
        CurrentVersion: version,
        AddEntries: [{
          Cidr: "10.0.2.67/32",
          Description: "arn:aws:ecs:ca-central-1:1234567891234:task/project/25d855faf7284494a5eef1ae702b951f"
        }]
      }
      assert.deepStrictEqual(formatParams(PendingStateEventMock, { id: prefixListId, version: 1 }), expectedParams)
    });

    it("must return formatted params for stopped status event", async () => {
      const version = 1
      const prefixListId = "id"
      const expectedParams = {
        PrefixListId: prefixListId,
        CurrentVersion: version,
        RemoveEntries: [{
          Cidr: "10.0.2.4/32",
        }]
      }
      assert.deepStrictEqual(formatParams(StoppedStateEventMock, { id: prefixListId, version: 1 }), expectedParams)
    });
  })

  describe("modifyPrefixList", () => {
    const sleep = async (ms) => {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    const formatParams = __test__.formatParams
    const modifyPrefixList = __test__.modifyPrefixList
    it("must retry if prefixList is locked while currently being modified", async () => {
      const prefixListId = "id"
      const version = 1

      AWSMock.mock('EC2', 'describeManagedPrefixLists', (_params: DescribePrefixListsRequest, callback: Function) => {
        callback(null, { PrefixLists: [{ PrefixListId: prefixListId, Version: version }] });
      })

      const spy = sinon.spy((_params: ModifyManagedPrefixListRequest, secondCallPromise: Function) => secondCallPromise(null,
        {
          $response: {
            httpResponse: {
              statusCode: 200
            },
          },
          PrefixList: {
            State: "modifying-in-progress"
          }
        }
      ));
      AWSMock.mock('EC2', 'modifyManagedPrefixList', (_params: ModifyManagedPrefixListRequest, firstCallPromise: Function) => {
        AWSMock.remock('EC2', 'modifyManagedPrefixList', spy)

        firstCallPromise({
          name: "IncorrectState",
          code: "IncorrectState",
          message: "Prefix list is currently being modified",
          statusCode: 400,
          time: new Date()
        } as Error & AWSError, null);
      })

      await modifyPrefixList(formatParams(PendingStateEventMock, { id: prefixListId, version: version }));
      await sleep(100)
      assert.strictEqual(spy.calledOnce, true);
    })
  })
});

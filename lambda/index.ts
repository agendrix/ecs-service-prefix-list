import { Handler } from "aws-lambda";
import AWS from "aws-sdk";
import { ModifyManagedPrefixListRequest } from "aws-sdk/clients/ec2";

const handler: Handler = async (event) => {
  try {
    ensureEventIsValid(event)
    const prefixList = await fetchPrefixList(process.env['PREFIX_LIST_ID'] as string)
    const params = formatParams(event, prefixList)
    modifyPrefixList(params)
  } catch (e) {
    console.log(JSON.stringify(event));
    throw e
  }
};

const ensureEventIsValid = (event) => {
  const isValid = (event.detail.lastStatus && (event.detail.lastStatus == "STOPPED" || event.detail.lastStatus == "PENDING"))
  if (!isValid) {
    throw new Error(`Event received with status ${event.detail.lastStatus} is not valid. Expecting STOPPED or PENDING state`);
  }
}

const fetchPrefixList = async (prefixListId) => {
  const result = await ec2Client().describeManagedPrefixLists({ PrefixListIds: [prefixListId] }).promise()
  const prefixList = result.PrefixLists?.pop()
  if (prefixList) {
    return {
      id: prefixList.PrefixListId,
      version: prefixList.Version
    }
  } else {
    throw new Error(`An error occurred while handling event. The prefixList ${prefixListId} was not found in region ${process.env.REGION}.`)
  }
}

const formatParams = (event, prefixList) => {
  const params = { PrefixListId: prefixList.id, CurrentVersion: prefixList.version }
  const cidr = fetchCidr(event)
  if (event.detail.lastStatus === "PENDING") {
    console.log(`Adding cidr ${cidr}, in prefixtList ${prefixList.id} of version ${prefixList.version}`)
    return (
      {
        ...params,
        AddEntries: [{
          Cidr: cidr,
          Description: event.detail.taskArn
        }]
      }
    )
  } else if (event.detail.lastStatus === "STOPPED") {
    console.log(`Removing cidr ${cidr}, in prefixtList ${prefixList.id} of version ${prefixList.version}`)
    return ({
      ...params,
      RemoveEntries: [{ Cidr: cidr }]
    })
  } else {
    throw new Error(`An error occurred while forwarding event ${event.id}. The task state ${event.detail.lastStatus} is not recognized by this function.`)
  }
}

const fetchCidr = (event) => {
  const eni = event.detail.attachments.find(attachment => attachment.type === "eni")
  const privateIp = eni.details.find(detail => detail.name === "privateIPv4Address");
  return `${privateIp.value}/32`
}

const modifyPrefixList = async (params: ModifyManagedPrefixListRequest, retryCount = 0) => {
  try {
    const result = await ec2Client().modifyManagedPrefixList(params).promise();
    result.$response
  } catch (e) {
    const retry = retryTime(retryCount + 1)
    if ((e.code === "IncorrectState" || e.code == "PrefixListVersionMismatch") && retry < 60000) {
      params.CurrentVersion = (await fetchPrefixList(params.PrefixListId)).version
      console.log(`Retrying request in ${retry}ms: ${e.message} with version ${params.CurrentVersion}`)
      setTimeout(modifyPrefixList, retry, params, retryCount + 1)
    } else {
      throw new Error(`An error occurred while handling event. Error ${JSON.stringify(e)}`)
    }
  }
}

const retryTime = (retryCount): number => {
  // backoff time strategy of Sidekiq
  // https://github.com/sidekiq/sidekiq/wiki/Error-Handling#automatic-job-retry
  return (retryCount ** 4) + 15 + (Math.random() * 10 * (retryCount + 1))
}

const ec2Client = () => (new AWS.EC2(({ region: process.env.REGION })));

exports.handler = handler;

export const __test__ = {
  handler,
  ensureEventIsValid,
  formatParams,
  fetchPrefixList,
  fetchCidr,
  modifyPrefixList
};

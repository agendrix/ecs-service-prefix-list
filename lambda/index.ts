import { Handler } from "aws-lambda";
import AWS from "aws-sdk";
import { ModifyManagedPrefixListRequest } from "aws-sdk/clients/ec2";
import { setTimeout } from "timers/promises"

const handler: Handler = async (event) => {
  try {
    if (!eventIsValid(event)) return;

    const prefixList = await fetchPrefixList(process.env['PREFIX_LIST_ID'] as string)
    const params = formatParams(event, prefixList)
    await modifyPrefixList(params)
  } catch (e) {
    console.log(JSON.stringify(event));
    throw e
  }
};

const eventIsValid = (event) => {
  const eventStatusIsRelevant = (event.detail.lastStatus && (event.detail.lastStatus == "STOPPED" || event.detail.lastStatus == "PENDING"))
  const eventHasEniAttachment = (event.detail.attachments && event.detail.attachments.find(attachment => attachment.type === "eni")) ? true : false
  const eventIsValid = eventStatusIsRelevant && eventHasEniAttachment
  if (!eventIsValid) {
    console.log(`
      Event received is not valid. 
      Either status is invalid or no ENI attachements were present in the event.
      Please check the event: 
    ${JSON.stringify(event)}
  `);
  }
  return eventIsValid
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
    console.log(`Exiting function, http response: ${result.$response.httpResponse.statusCode}, Prefix list state: ${result.PrefixList?.State}`)
  } catch (e) {
    const retry = retryTime(retryCount + 1)
    if (e.code === "IncorrectState" || e.code == "PrefixListVersionMismatch") {
      params.CurrentVersion = (await fetchPrefixList(params.PrefixListId)).version
      console.log(`Retrying request in ${retry}ms: ${e.message} with version ${params.CurrentVersion}`)
      setTimeout(retry, await modifyPrefixList(params, retryCount + 1))
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

const ec2Client = () => (new AWS.EC2(({ region: process.env.TRACKER_REGION })));

exports.handler = handler;

export const __test__ = {
  handler,
  eventIsValid,
  formatParams,
  fetchPrefixList,
  fetchCidr,
  modifyPrefixList
};

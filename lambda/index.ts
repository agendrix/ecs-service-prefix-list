import { Handler } from "aws-lambda";
import AWS from "aws-sdk";

const handler: Handler = async (event) => {
  const prefixList = await fetchPrefixList(process.env['PREFIX_LIST_ID'] as string)
  const params = formatParams(event, prefixList)
  const response = await ec2Client().modifyManagedPrefixList(params).promise();
  if (response.$response.retryCount !== 0) {
    throw new Error(`An error occurred while handling event ${event.id}. Error code: ${response.$response.httpResponse.statusCode}, Error message: ${response.$response.httpResponse.body.toString}`)
  }
};

const fetchCidr = (event) => {
  const eni = event.detail.attachments.find(attachment => attachment.type === "eni")
  const privateIp = eni.details.find(detail => detail.name === "privateIPv4Address");
  return `${privateIp.value}/32`
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
    console.log(`Adding cidr ${cidr}, in prefixtList ${prefixList.id}`)
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
    console.log(`Removing cidr ${cidr}, in prefixtList ${prefixList.id}`)
    return ({
      ...params,
      RemoveEntries: [{ Cidr: cidr }]
    })
  } else {
    throw new Error(`An error occurred while forwarding event ${event.id}. The task state ${event.detail.lastStatus} is not recognized by this function.`)
  }
}

const ec2Client = () => (new AWS.EC2(({ region: process.env.REGION })));

exports.handler = handler;

export const __test__ = {
  handler,
  formatParams
};

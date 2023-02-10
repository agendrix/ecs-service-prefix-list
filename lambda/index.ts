import { Handler } from "aws-lambda";
import AWS from "aws-sdk";

const handler: Handler = async (event) => {
  const ec2 = new AWS.EC2(({ region: process.env.REGION }));
  const params = formatParams(event)
  const response = await ec2.modifyManagedPrefixList(params).promise();
  if (response.$response.retryCount !== 0) {
    throw new Error(`An error occurred while handling event ${event.id}. Error code: ${response.$response.httpResponse.statusCode}, Error message: ${response.$response.httpResponse.body.toString}`)
  }
};

const fetchCidr = (event) => {
  const eni = event.detail.attachments[0]
  const privateIp = eni.details.find.find(detail => detail.name === "privateIPv4Address");
  return `${privateIp.value}/32`
}

const formatParams = (event) => {
  const params = { PrefixListId: process.env['PREFIX_LIST_ID'] as string }
  const cidr = fetchCidr(event)
  if (event.detail.lastStatus === "PENDING") {
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
    return ({
      ...params,
      RemoveEntries: [{ Cidr: cidr }]
    })
  } else {
    throw new Error(`An error occurred while forwarding event ${event.id}. The task state ${event.detail.lastStatus} is not recognized by this function.`)
  }
}

exports.handler = handler;

export const __test__ = {
  handler,
  formatParams
};

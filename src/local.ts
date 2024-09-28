import { APIGatewayEventRequestContextV2 } from "aws-lambda";
import { handler } from "./handler";

async function run() {
  const result = await handler({
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    },
    queryStringParameters: {
      w: "2048",
      q: "75",
      url: "https://upload.wikimedia.org/wikipedia/commons/4/4e/FILE_Rio_de_Janeiro_2018_-_A_Arte_Eletr%C3%B4nica_na_%C3%89poca_Disruptiva%2C_Festival_Internacional_de_Linguagem_Eletr%C3%B4nica.gif",
    },
    /* Dummy */
    isBase64Encoded: false,
    rawPath: "",
    rawQueryString: "",
    routeKey: "",
    version: "",
    requestContext: {} as APIGatewayEventRequestContextV2,
  });

  console.log(result);
}

run();

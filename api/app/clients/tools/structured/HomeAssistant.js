const axios = require('axios');
const { StructuredTool } = require('langchain/tools');
const { logger } = require('~/config');
const { z } = require('zod');
const urlJoin = require('url-join');
const WebSocket = require('faye-websocket');

function getServerURL() {
  const url = process.env.HA_API_URL || '';
  // if (!url) {
  //   throw new Error('Missing HA_API_URL environment variable.');
  // }
  return url;
}
class HomeAssistantCheckAPI extends StructuredTool {
  constructor({ url, token }) {
    super();
    this.name = 'ha-check-api';
    this.url = url;
    this.token = token;
    logger.info(
      `Created home assistant tool with URL: ${JSON.stringify(this.url)} using token: ${
        process.env.HA_API_KEY
      }`,
    );
    this.schema = z.object({});
  }
  async _call(input) {
    logger.info(`Calling Home Assistant with input ${input}`);
    logger.info('Checking Home Assistant API status');

    const response = await axios.get(this.url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    logger.info(`Got response ${JSON.stringify(response.status)} - Was OK? ${response.ok}`);

    if (!response.status === 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    logger.info(`Got response data ${JSON.stringify(response.data)}`);
    return JSON.stringify(response.data);
  }
}
class HomeAssistantQueryService extends StructuredTool {
  constructor({ url, token }) {
    super();
    this.name = 'ha-check-api';
    this.url = url;
    this.token = token;
    logger.info(
      `Created home assistant tool with URL: ${JSON.stringify(this.url)} using token: ${
        this.token
      }`,
    );
    this.schema = z.object({});
  }
  async _call(domain) {
    logger.info(`Calling Query Service with input ${domain}`);
    logger.info('Checking Home Assistant API status');

    const serviceUrl = urlJoin(this.url, 'services');
    const response = await axios.get(serviceUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info(`Got response ${JSON.stringify(response.status)} - Was OK? ${response.ok}`);

    if (!response.status === 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const simplifiedList = response.data.filter((item) => item.domain === domain);

    return JSON.stringify(simplifiedList);
  }
}
class HomeAssistantCallService extends StructuredTool {
  constructor({ url, token }) {
    super();
    this.name = 'ha-check-api';
    this.url = url;
    this.token = token;
    logger.info(
      `Created home assistant tool with URL: ${JSON.stringify(this.url)} using token: ${
        this.token
      }`,
    );
    this.schema = z.object({});
  }
  async _call(domain, service, entity, data) {
    logger.info(`Calling service ${service}`);
    return new Promise((resolve, reject) => {
      let retried = false;
      const wsurl = urlJoin(this.url.replace('https', 'wss'), '/websocket');
      logger.info(`Using websocket URL ${wsurl}`);
      const ws = new WebSocket.Client(wsurl);
      const token = this.token;
      ws.on('open', function () {
        logger.info('Websocket opened');
        const authMessage = {
          type: 'auth',
          access_token: `${token}`,
        };
        logger.info(`Sending auth message ${JSON.stringify(authMessage)}`);
        ws.send(JSON.stringify(authMessage));
      });

      ws.on('message', function (event) {
        logger.info(`on message ${event.data}`);
        const message = JSON.parse(event.data);

        if (message.type === 'auth_ok') {
          const callServiceMessage = {
            type: 'call_service',
            domain: domain,
            service: service,
            target: { entity_id: entity },
            service_data: data,
            id: 1,
            return_response: true,
          };
          ws.send(JSON.stringify(callServiceMessage));
        }
        if (message.type === 'result') {
          if (message.success) {
            logger.info('got result');
            if (message.result.response) {
              resolve(JSON.stringify(message.result.response));
            } else {
              resolve('done');
            }
            ws.close();
          } else if (!retried) {
            if (message.error.code === 'service_validation_error') {
              logger.info('Service validation error, retrying without return_response');
              const callServiceMessage = {
                type: 'call_service',
                domain: domain,
                service: service,
                target: { entity_id: entity },
                service_data: data,
                id: 2,
              };
              ws.send(JSON.stringify(callServiceMessage));
              retried = true;
            }
          } else {
            resolve(JSON.stringify(message));
          }
        }
      });

      ws.on('close', function () {
        logger.info('Websocket closed');
        reject('Connection closed');
      });
    });

    // logger.info(`Calling Call Service with input ${domain} ${service} ${entity} ${data}`);
    // logger.info('Checking Home Assistant API status');
    // data.entity_id = entity;
    // const serviceUrl = urlJoin(this.url, 'services', domain, service);
    // const response = await axios.post(serviceUrl, data, {
    //   headers: {
    //     Authorization: `Bearer ${this.token}`,
    //     'Content-Type': 'application/json',
    //   },
    // });

    // logger.info(`Got response ${JSON.stringify(response.status)} - Was OK? ${response.ok}`);

    // if (!response.status === 200) {
    //   throw new Error(`Request failed with status ${response.status}`);
    // }

    // return JSON.stringify(response.data);
  }
}
class HomeAssistantQueryEntityState extends StructuredTool {
  constructor({ url, token }) {
    super();
    this.name = 'ha-check-api';
    this.url = url;
    this.token = token;
    logger.info(
      `Created home assistant tool with URL: ${JSON.stringify(this.url)} using token: ${
        process.env.HA_API_KEY
      }`,
    );
    this.schema = z.object({});
  }
  async _call(domain, entity) {
    logger.info(`Calling Check State with input ${domain}.${entity}`);
    logger.info('Checking Home Assistant API status');

    if (!domain && !!entity) {
      if (entity.indexOf('.') > -1) {
        const splitEntity = entity.split('.');
        domain = splitEntity[0];
        entity = splitEntity[1];
      }
    }
    const response = await axios.get(urlJoin(this.url, 'states', `${domain}.${entity}`), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    logger.info(`Got response ${JSON.stringify(response.status)} - Was OK? ${response.ok}`);

    if (!response.status === 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    logger.info(`Got response data ${JSON.stringify(response.data)}`);
    return JSON.stringify(response.data);
  }
}

class HomeAssistantQueryDomainState extends StructuredTool {
  constructor({ url, token }) {
    super();
    this.name = 'ha-check-api';
    this.url = url;
    this.token = token;
    logger.info(
      `Created home assistant tool with URL: ${JSON.stringify(this.url)} using token: ${
        process.env.HA_API_KEY
      }`,
    );
    this.schema = z.object({});
  }
  async _call(domain) {
    logger.info(`Calling Check State with input ${domain}`);
    logger.info('Checking Home Assistant API status');

    logger.info('Calling all states and filtering');
    const response = await axios.get(urlJoin(this.url, 'states'), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    logger.info(`Got response ${JSON.stringify(response.status)} - Was OK? ${response.ok}`);

    if (!response.status === 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    logger.info(`Got response data ${JSON.stringify(response.data)}`);
    const filteredList = response.data.map((item) => {
      // Check if the entity_id starts with "domain."
      if (item.entity_id.startsWith(`${domain}.`)) {
        return {
          entity_id: item.entity_id,
          state: item.state,
          last_changed: item.last_changed,
        };
      }
    });

    const simplifiedList = filteredList.filter((item) => item);

    return JSON.stringify(simplifiedList);
  }
}
class HomeAssistant extends StructuredTool {
  constructor(fields) {
    super();
    // logger.info(`Creating Home Assistant tool with fields ${JSON.stringify(fields)} and env ${JSON.stringify(process.env)}`);
    this.name = 'home-assistant';
    this.url = fields.HA_API_URL || getServerURL();
    this.token = fields.HA_API_KEY;
    this.description = `You can query and control home assistant entities using this tool.
    
    In Command pass one of the following: 
     - checkAPI: This will check the API is available and running
     - queryState: Pass with no other parameters for a full list of all entities.  Pass with domain for a more detailed list of all entities in a domain.  Pass with an domain and entity for full details of a particular entity.
     - queryService: Pass with a domain to list all the services available for that domain.
     - callService: (not yet implemented) Pass with a domain, service name, and correct data.

     You will need to combine multiple calls to achieve your goals, for example if asked add an item to the shopping list:
     - Firstly queryState for domain 'todo' and find the entity ID that most sounds like a shopping list.
     - Then call the queryService domain 'todo' and find the service name that matches what you want to do (list items)
     - Then call service, passing in the domain 'todo', the entity ID, the service name, and a data object using the shape of the data from the call to the service.
     `;
    this.schema = z.object({
      command: z
        .string()
        .describe(
          'The command type to run, one of checkAPI, queryState, queryService, callService.',
        ),
      domain: z.string().optional().describe('The domain of the entity.'),
      entity: z
        .string()
        .optional()
        .describe(
          'The entity to interact with.  This can either be the full entity ID (e.g. domain.entity) or the domain can be passed as a separate parameter.',
        ),
      service: z.string().optional().describe('The service to call, when running callService.'),
      data: z.any().optional().describe('An optional data value to pass to service calls'),
    });

    this.CheckAPI = new HomeAssistantCheckAPI({ url: this.url, token: this.token });
    this.checkAPI = this.CheckAPI._call.bind(this);
    this.QueryDomainState = new HomeAssistantQueryDomainState({ url: this.url, token: this.token });
    this.queryDomainState = this.QueryDomainState._call.bind(this);
    this.QueryEntityState = new HomeAssistantQueryEntityState({ url: this.url, token: this.token });
    this.queryEntityState = this.QueryEntityState._call.bind(this);
    this.QueryService = new HomeAssistantQueryService({ url: this.url, token: this.token });
    this.queryService = this.QueryService._call.bind(this);
    this.CallService = new HomeAssistantCallService({ url: this.url, token: this.token });
    this.callService = this.CallService._call.bind(this);
  }

  async _call(input) {
    switch (input.command) {
      case 'checkAPI':
        return await this.checkAPI();
      case 'queryState':
        if (input.entity) {
          return await this.queryEntityState(input.domain, input.entity);
        }
        return await this.queryDomainState(input.domain);
      case 'queryService':
        return await this.queryService(input.domain);
      case 'callService':
        return await this.callService(input.domain, input.service, input.entity, input.data);
    }
    return 'Command not recognised';
  }
}
module.exports = HomeAssistant;

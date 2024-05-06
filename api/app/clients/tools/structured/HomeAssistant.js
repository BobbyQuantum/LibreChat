const axios = require('axios');
const { StructuredTool } = require('langchain/tools');
const { logger } = require('~/config');
const { z } = require('zod');
const urlJoin = require('url-join');

function getServerURL() {
  const url = process.env.HA_API_URL || '';
  // if (!url) {
  //   throw new Error('Missing HA_API_URL environment variable.');
  // }
  return url;
}
class HomeAssistantCheckAPI extends StructuredTool {
  constructor(url, token) {
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
class HomeAssistantQueryState extends StructuredTool {
  constructor(url, token) {
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

    if (!!domain && !!entity) {
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
    this.description = `You can query and control home assistant entities.
    
    Pass a command one of the following: 
     - checkAPI: This will check the API is available and running
     - queryState: Pass with no other parameters for a full list of all entities.  Pass with domain for a more detailed list of all entities in a domain.  Pass with an domain and entity for full details of a particular entity.
     - queryService: Pass with a domain to list all the services available for that domain.
     - callService: (not yet implemented) Pass with a domain, service name, and correct data.
     `;
    this.schema = z.object({
      command: z
        .string()
        .describe('The command type to run, one of checkAPI, queryState, queryService.'),
      domain: z.string().optional().describe('The domain of the entity.'),
      entity: z
        .string()
        .optional()
        .describe(
          'The entity to interact with.  This can either be the full entity ID (e.g. domain.entity) or the domain can be passed as a separate parameter.',
        ),
    });

    this.CheckAPI = new HomeAssistantCheckAPI({ url: this.url, token: this.token });
    this.checkAPI = this.CheckAPI._call.bind(this);
    this.QueryState = new HomeAssistantQueryState({ url: this.url, token: this.token });
    this.queryState = this.QueryState._call.bind(this);
  }

  async _call(input) {
    switch (input.command) {
      case 'checkApi':
        return await this.checkAPI();
      case 'queryState':
        return await this.queryState(input.domain, input.entity);
    }
    return 'Command not recognised';
  }
}
module.exports = HomeAssistant;

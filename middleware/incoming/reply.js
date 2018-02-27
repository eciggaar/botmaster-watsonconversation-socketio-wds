/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const watson = require('watson-developer-cloud');
const config = require('../../config');
const watsonConversationStorageMiddleware = require('../watson_conversation_storage');
const watsonConversation = new watson.ConversationV1(config.watsonConversationCredentials);
const DISCOVERY_ACTION = 'discovery'; // constant that defines the call Discovery action

let workspaceId = process.env.WATSON_WORKSPACE_ID;
let workspaceFound = false;

const watsonDiscovery = new watson.DiscoveryV1(config.watsonDiscoveryCredentials);
let queryParams = {
  environment_id: process.env.WDS_ENVIRONMENT_ID,
  collection_id: process.env.WDS_COLLECTION_ID,
  configuration_id: process.env.WDS_CONFIGURATION_ID,
  passages: true,
  natural_language_query: ""
}

const replyToUser = {
  type: 'incoming',
  name: 'reply-to-user',
  controller: (bot, update, next) => {

    if (!workspaceFound) {
      // First check whether the conversation service has a workspace with an UUID that is defined
      // as WATSON_WORKSPACE_ID environment variable.
      watsonConversation.getWorkspace( {workspace_id: workspaceId}, (err, watsonWorkspace) => {
        if (err) {
          console.log(err.error);
          console.log('Obtaining the first defined workspace in the conversation service...');

          // In case there is no workspace found with UUID equal to the environment variable
          // WATSON_WORKSPACE_ID, list all workspaces and set the workspace id to the first one
          // found.
          watsonConversation.listWorkspaces( (err, watsonWorkspaces) => {
            if (!err && watsonWorkspaces.workspaces[0]) {
              workspaceId = watsonWorkspaces.workspaces[0].workspace_id;
              console.log('The following workspace is used....');
              console.log('  * name : \"' + watsonWorkspaces.workspaces[0].name + '\"');
              console.log('  * id   : \"' + workspaceId + '\"');

              workspaceFound = true;
            }

            submitMessage(bot, update);
          });
        } else {
          console.log('Getting workspace via env variable...');
          console.log('The following workspace is used....');
          console.log('  * name : \"' + watsonWorkspace.name + '\"');
          console.log('  * id   : \"' + workspaceId + '\"');

          workspaceFound = true;

          submitMessage(bot, update);
        }
      });
    }

    if (workspaceFound) {
      submitMessage(bot, update);
    }

    next();
  }
};

function submitMessage(bot, update) {
  const messageForWatson = {
      context: update.session.context,
      workspace_id: workspaceId,
      input: {
          text: update.message.text,
      }
  };

  watsonConversation.message(messageForWatson, (err, watsonUpdate) => {
      if (err) {
        bot.sendTextCascadeTo(['Welcome! To complete the setup, follow the steps in the <a href="https://github.com/eciggaar/botmaster-watsonconversation-socketio#step-1-import-your-workspace">README.md</a> to create your own workspace and link it to this application.',
                              'Have fun!!'], update.sender.id);
      } else {
        watsonConversationStorageMiddleware.updateSession(update.sender.id, watsonUpdate);

        if ((watsonUpdate.context.action) && (watsonUpdate.context.action.lookup === DISCOVERY_ACTION)) {
          delete(watsonUpdate.context.action);
          queryDiscovery(bot,update); // Query discovery with the natural language input that was sent to conversation and mapped to call discovery intent
        } else {
          const watsontext = watsonUpdate.output.text;
          bot.sendTextCascadeTo(watsontext, update.sender.id);
        }
      }
  });
}

function queryDiscovery(bot,update) {
  queryParams.natural_language_query = update.message.text;
  let discoveryResponse = '';

  watsonDiscovery.query(queryParams, function(err, searchResponse) {
    if (err) {
      bot.sendTextCascadeTo('Ooops....something went wrong with the WDS service. Please check its configuration...');
      console.log(err);
    } else {
      const bestPassage = searchResponse.passages[0];
      console.log('Passage score: ', bestPassage.passage_score);
      console.log('Passage text: ', bestPassage.passage_text);

      bot.sendTextMessageTo(bestPassage.passage_text, update.sender.id);
    }
  });
}

module.exports = {
  replyToUser
}

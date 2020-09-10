import commands from '../../commands';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import {
  CommandOption,
  CommandValidate
} from '../../../../Command';
import SpoCommand from '../../../base/SpoCommand';
import Utils from '../../../../Utils';
import * as fs from 'fs';
import * as path from 'path';
import { FileProperties } from './FileProperties';

const vorpal: Vorpal = require('../../../../vorpal-init');

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  webUrl: string;
  url?: string;
  id?: string;
  asString?: boolean;
  asListItem?: boolean;
  asFile?: boolean;
  path?: string;
}

class SpoFileGetCommand extends SpoCommand {
  public get name(): string {
    return commands.FILE_GET;
  }

  public get description(): string {
    return 'Gets information about the specified file';
  }

  public getTelemetryProperties(args: CommandArgs): any {
    const telemetryProps: any = super.getTelemetryProperties(args);
    telemetryProps.id = (!(!args.options.id)).toString();
    telemetryProps.url = (!(!args.options.url)).toString();
    telemetryProps.asString = args.options.asString || false;
    telemetryProps.asListItem = args.options.asListItem || false;
    telemetryProps.asFile = args.options.asFile || false;
    telemetryProps.path = (!(!args.options.path)).toString();
    return telemetryProps;
  }

  public commandAction(cmd: CommandInstance, args: CommandArgs, cb: () => void): void {
    if (this.verbose) {
      cmd.log(`Retrieving file from site ${args.options.webUrl}...`);
    }

    let requestUrl: string = '';
    let options: string = '';

    if (args.options.id) {
      requestUrl = `${args.options.webUrl}/_api/web/GetFileById('${encodeURIComponent(args.options.id)}')`;
    }
    else if (args.options.url) {
      requestUrl = `${args.options.webUrl}/_api/web/GetFileByServerRelativePath(DecodedUrl=@f)`;
    }

    if (args.options.asListItem) {
      options = '?$expand=ListItemAllFields';
    }
    else if (args.options.asFile || args.options.asString) {
      options = '/$value';
    }

    if (args.options.url) {
      if (options.indexOf('?') < 0) {
        options += '?';
      }
      else {
        options += '&';
      }

      options += `@f='${encodeURIComponent(args.options.url)}'`
    }

    const requestOptions: any = {
      url: requestUrl + options,
      headers: {
        'accept': 'application/json;odata=nometadata'
      },
      encoding: null, // Set encoding to null, otherwise binary data will be encoded to utf8 and binary data is corrupt
      json: true
    };

    if (args.options.asFile) {
      request
        .getLargeFile<string>(requestOptions, args.options.path as string)
        .then((file: string): void => {
          if (this.verbose) {
            cmd.log(`File saved at ${file}`);
          }
          cb();
        }, (err: any): void => this.handleRejectedODataJsonPromise(err, cmd, cb));
    }
    else {
      request
        .get<string>(requestOptions)
        .then((file: string): void => {
          if (args.options.asString) {
            cmd.log(file.toString());
          }
          else if (args.options.asListItem) {
            const fileProperties: FileProperties = JSON.parse(JSON.stringify(file));
            cmd.log(fileProperties.ListItemAllFields)
          }
          else {
            const fileProperties: FileProperties = JSON.parse(JSON.stringify(file));
            cmd.log(fileProperties);
          }

          cb();
        }, (err: any): void => this.handleRejectedODataJsonPromise(err, cmd, cb));
    }
  }

  public options(): CommandOption[] {
    const options: CommandOption[] = [
      {
        option: '-w, --webUrl <webUrl>',
        description: 'The URL of the site where the file is located'
      },
      {
        option: '-u, --url [url]',
        description: 'The server-relative URL of the file to retrieve. Specify either url or id but not both'
      },
      {
        option: '-i, --id [id]',
        description: 'The UniqueId (GUID) of the file to retrieve. Specify either url or id but not both'
      },
      {
        option: '--asString',
        description: 'Set to retrieve the contents of the specified file as string'
      },
      {
        option: '--asListItem',
        description: 'Set to retrieve the underlying list item'
      },
      {
        option: '--asFile',
        description: 'Set to save the file to the path specified in the path option'
      },
      {
        option: '-p, --path [path]',
        description: 'The local path where to save the retrieved file. Must be specified when the --asFile option is used'
      }
    ];

    const parentOptions: CommandOption[] = super.options();
    return options.concat(parentOptions);
  }

  public validate(): CommandValidate {
    return (args: CommandArgs): boolean | string => {
      if (!args.options.webUrl) {
        return 'Required parameter webUrl missing';
      }

      const isValidSharePointUrl: boolean | string = SpoCommand.isValidSharePointUrl(args.options.webUrl);
      if (isValidSharePointUrl !== true) {
        return isValidSharePointUrl;
      }

      if (args.options.id) {
        if (!Utils.isValidGuid(args.options.id)) {
          return `${args.options.id} is not a valid GUID`;
        }
      }

      if (args.options.id && args.options.url) {
        return 'Specify id or url, but not both';
      }

      if (!args.options.id && !args.options.url) {
        return 'Specify id or url, one is required';
      }

      if (args.options.asFile && !args.options.path) {
        return 'The path should be specified when the --asFile option is used';
      }

      if (args.options.path && !fs.existsSync(path.dirname(args.options.path))) {
        return 'Specified path where to save the file does not exits';
      }

      if (args.options.asFile) {
        if (args.options.asListItem || args.options.asString) {
          return 'Specify to retrieve the file either as file, list item or string but not multiple';
        }
      }

      if (args.options.asListItem) {
        if (args.options.asFile || args.options.asString) {
          return 'Specify to retrieve the file either as file, list item or string but not multiple';
        }
      }

      return true;
    };
  }

  public commandHelp(args: {}, log: (help: string) => void): void {
    const chalk = vorpal.chalk;
    log(vorpal.find(this.name).helpInformation());
    log(
      `  Examples:

    Get file properties for file with id (UniqueId) ${chalk.grey('b2307a39-e878-458b-bc90-03bc578531d6')}
    located in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --id 'b2307a39-e878-458b-bc90-03bc578531d6'

    Get contents of the file with id (UniqueId) ${chalk.grey('b2307a39-e878-458b-bc90-03bc578531d6')}
    located in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --id 'b2307a39-e878-458b-bc90-03bc578531d6' --asString

    Get list item properties for file with id (UniqueId)
    ${chalk.grey('b2307a39-e878-458b-bc90-03bc578531d6')} located in site
    ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --id 'b2307a39-e878-458b-bc90-03bc578531d6' --asListItem

    Save file with id (UniqueId) ${chalk.grey('b2307a39-e878-458b-bc90-03bc578531d6')} located
    in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')} to local file
    ${chalk.grey('/Users/user/documents/SavedAsTest1.docx')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --id 'b2307a39-e878-458b-bc90-03bc578531d6' --asFile --path /Users/user/documents/SavedAsTest1.docx

    Return file properties for file with server-relative url
    ${chalk.grey('/sites/project-x/documents/Test1.docx')} located in site
    ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --url '/sites/project-x/documents/Test1.docx'

    Return file as string for file with server-relative url
    ${chalk.grey('/sites/project-x/documents/Test1.docx')} located in site
    ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --url '/sites/project-x/documents/Test1.docx' --asString

    Return list item properties for file with server-relative url
    ${chalk.grey('/sites/project-x/documents/Test1.docx')} located in site
    ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --url '/sites/project-x/documents/Test1.docx' --asListItem

    Save file with server-relative url ${chalk.grey('/sites/project-x/documents/Test1.docx')}
    located in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
    to local file ${chalk.grey('/Users/user/documentsSavedAsTest1.docx')}
      ${commands.FILE_GET} --webUrl https://contoso.sharepoint.com/sites/project-x --url '/sites/project-x/documents/Test1.docx' --asFile --path /Users/user/documents/SavedAsTest1.docx
      `);
  }
}

module.exports = new SpoFileGetCommand();

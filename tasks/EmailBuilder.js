/*
 * grunt-EmailBuilder
 * https://github.com/yargalot/Email-Builder
 *
 * Copyright (c) 2013 Steven Miller
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {

  // Please see the grunt documentation for more information regarding task and
  // helper creation: https://github.com/gruntjs/grunt/blob/master/docs/toc.md

  // ==========================================================================
  // TASKS
  // ==========================================================================

  // Task Desciption
  var task_name         = 'emailBuilder';
  var task_description  = 'Compile Files';


  // Required modules
  var juice     = require('juice');
  var builder   = require('xmlbuilder');
  var less      = require('less');
  var jade      = require('jade');
  var path      = require('path');
  var cheerio   = require('cheerio');
  var _         = require('lodash');
  var async     = require('async');
  var request   = require('request');

  grunt.registerMultiTask(task_name, task_description, function() {

    var options   = this.options();
    var done      = this.async();

    async.forEachSeries(this.files, function(file, next) {

      var data      = grunt.file.read(file.src);
      var basename  = path.basename(file.src,  '.html');
      var basepath  = process.cwd();

      // jade compile
      if ( path.extname(file.src) === '.jade') {
        data = renderJade(data, file.src);
      }

      var $           = cheerio.load(data);
      var date        = grunt.template.today('yyyy-mm-dd');
      var title       = $('title').text() + date;
      var srcFiles    = [];
      var embeddedCss = '';
      var extCss;

      // External stylesheet
      $('link').each(function (i, elem) {

        if (!$(this).attr('data-placement')) {
          return;
        }

        srcFiles.push({
          file    : $(this).attr('href'),
          inline  : $(this).attr('data-placement') === 'style-tag' ? false : true
        });

        $(this).remove();
      });

      // Embedded Stylesheet. Will ignore style tags with data-ignore attribute
      $('style').each(function(i, element){
        if(!$(this).attr('data-ignore')){
          embeddedCss += $(this).text();
          $(this).remove();
        }
      });

      // Set to target file path to get css
      grunt.file.setBase(path.dirname(file.src));

      // Less Compilation
      async.forEachSeries(srcFiles, function(srcFile, nextFile) {

        renderCss(srcFile.file, function(data) {

          if (srcFile.inline) {
            extCss = data;
          } else {
            $('head').append('<style>' + data + '</style>');
          }

          nextFile();

        });

      }, function(err) {

        if(err) {
          grunt.log.error(err);
        }

        var html = $.html();
        var allCss = embeddedCss + extCss;
        var output = allCss ? juice.inlineContent(html, allCss) : html;

        grunt.file.setBase(basepath);
        grunt.log.writeln('Writing...'.cyan);
        grunt.file.write(file.dest, output);
        grunt.log.writeln('File ' + file.dest.cyan + ' created.');

        if (options.litmus) {

          sendLitmus(output, title);

        } else {
          next();
        }
      });

    }, function() {
      done();
    });

    function renderCss(input, callback) {

      var data = grunt.file.read(input);

      if ( path.extname(input) === '.less') {
        var parser = new(less.Parser)({
          paths     : [path.dirname(input)], // Specify search paths for @import directives
          filename  : path.basename(input) // Specify a filename, for better error messages
        });

        parser.parse(data, function (err, tree) {
          if (err) {
            return console.error(err);
          }

          data = tree.toCSS(); // Minify CSS output
          callback(data);
        });

      } else {

        callback(data);

      }
    }

    function renderJade(data, filename) {
      // Compile Jade files
      var fn    = jade.compile(data, {
        filename: filename,
        pretty : true
      });

      return fn(options.jade);
    }

    function sendLitmus(data, title) {

      var username    = options.litmus.username;
      var password    = options.litmus.password;
      var accountUrl  = options.litmus.url;
      var subject     = options.litmus.subject || title;
      var xml         = xmlBuild(data, subject);
      var opts = {
        'url': accountUrl + '/emails.xml',
        'method': 'POST',
        'headers': {
          'Content-type': 'application/xml',
          'Accept': 'application/xml'
        },
        'auth': {
          'user': username,
          'pass': password,
        },
        'body': xml
      };

      request(opts, function(err, res, body){
        if(err) {
          throw err;
        }

        var headers = res.headers;

        Object.keys(headers).forEach(function(key){
          console.log(key.toUpperCase().bold + ': ' + headers[key]);
        });

        console.log('---------------------\n' + body);

      });
    }

    //Application XMl Builder
    function xmlBuild(data, title) {
      var xmlApplications = builder.create('applications').att('type', 'array');

      _.each(options.litmus.applications, function(app) {
        var item = xmlApplications.ele('application');

        item.ele('code', app);
      });

      //Build Xml to send off, Join with Application XMl
      var xml = builder.create('test_set')
        .importXMLBuilder(xmlApplications)
        .ele('save_defaults', 'false').up()
        .ele('use_defaults', 'false').up()
        .ele('email_source')
          .ele('body').dat(data).up()
          .ele('subject', title)
        .end({pretty: true});

      return xml;
    }

  });

};

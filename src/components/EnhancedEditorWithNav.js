import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MonacoEditor from 'react-monaco-editor';
import ReactResizeDetector from 'react-resize-detector';
import FileDownload from 'react-file-download';
import Delve from 'dlv';
import PapaParse from 'papaparse';
import _ from 'lodash';

import registerJsonataLanguage from './monacoIntegration/jsonata';
import EditorNav from './EditorNav';
import Notification from './Notification';

/**
 * A wrapper for the react-monaco-editor that adds a layout method and
 * some convenient props.
 */
export default class EnhancedEditorWithNav extends Component {
  constructor(props) {
    super(props);
    this.monacoEditor = null;
    this.monaco = null;
    this.editorDidMount = this.editorDidMount.bind(this);
    this._onFormatClick = this._onFormatClick.bind(this);
    this._onDownloadClick = this._onDownloadClick.bind(this);
    this._onDownloadCSVClick = this._onDownloadCSVClick.bind(this);
    this.notificationElement = React.createRef();
  }

  getModel() {
    if (this.monacoEditor != null) {
      return this.monacoEditor.getModel();
    }
  }

  /**
   * Trigger layout
   *
   */
  layout() {
    if (this.monacoEditor != null) {
      this.monacoEditor.layout();
    }
  }

  /**
   * Clear any decorations from editor
   *
   */
  clearDecorations() {
    if (this.monacoEditor != null) {
      this.monacoEditor.decorations = this.monacoEditor.deltaDecorations(
        this.monacoEditor.decorations,
        []
      );
    }
  }

  /**
   * Add an error decoration based on start and end position
   *
   * @param {integer} start
   * @param {integer} end
   */
  addErrorDecoration(start, end) {
    if (this.monacoEditor != null) {
      const buffer = this.monacoEditor.getModel().getValue();
      const resolve = (offset) => {
        let line = 1;
        let column = 1;
        let position = 1;
        while (position < offset) {
          if (buffer.charAt(position) === '\n') {
            line++;
            column = 0;
          } else {
            column++;
          }
          position++;
        }
        return { line, column };
      };
      const from = resolve(start);
      const to = resolve(end);
      this.monacoEditor.decorations = this.monacoEditor.deltaDecorations(
        this.monacoEditor.decorations,
        [
          {
            range: new this.monaco.Range(from.line, from.column, to.line, to.column),
            options: { inlineClassName: 'jsonataErrorMarker' },
          },
          {
            range: new this.monaco.Range(from.line, 1, to.line, 1),
            options: {
              isWholeLine: true,
              linesDecorationsClassName: 'jsonataErrorMargin',
            },
          },
        ]
      );
    }
  }

  updateNoUndo(text) {
    const model = this.getModel();
    model.applyEdits([
      {
        range: new this.monaco.Range(
          1,
          1,
          model.getLineCount(),
          model.getLineMaxColumn(model.getLineCount())
        ),
        text,
      },
    ]);
  }

  _onFormatClick(eventKey, event) {
    if (this.props.formatEnabled && this.props.language === 'json') {
      const model = this.getModel();
      const formatted = JSON.stringify(JSON.parse(model.getValue()), null, 2);
      this.updateNoUndo(formatted);
    }
  }

  _onDownloadClick(eventKey, event) {
    if (this.props.downloadEnabled) {
      const filename = `${Delve(this, 'props.label', 'filename')}.${Delve(
        this,
        'props.language',
        'json'
      )}`;
      const model = this.getModel();
      const data = model.getValue();
      FileDownload(data, filename.toLowerCase(), 'text/plain');
    }
  }

  _onDownloadCSVClick(eventKey, event) {
    if (this.props.downloadCSVEnabled) {
      const lang = Delve(this, 'props.language', null);
      const filename = `${Delve(this, 'props.label', 'filename')}.csv`;

      if (lang.toLowerCase() === 'json') {
        const papaparseConfig = {
          quotes: true,
          quoteChar: '"',
          escapeChar: '"',
          delimiter: ',',
          header: true,
          newline: '\r\n',
        };

        const model = this.getModel();
        const text = model.getValue();
        let data = JSON.parse(text);
        if (!_.isArray(data)) {
          data = [data];
        }
        try {
          const csv = PapaParse.unparse(data, papaparseConfig);
          if (!_.isEmpty(csv)) {
            FileDownload(csv, filename.toLowerCase(), 'text/csv');
          } else {
            this.notificationElement.current.setMessage(
              'The JSON parsed to CSV was an empty file.'
            );
          }
        } catch (error) {
          this.notificationElement.current.setMessage(
            `There was a problem parsing the JSON to CSV. Err: ${error.message}`,
            'danger'
          );
        }
      }
    }
  }

  /**
   * Add an error decoration based on extracting position from
   * err, supports json and jsonata
   *
   * @param {*} err
   */
  addErrorDecorationFromErr(err) {
    let start = 0;
    let end = 0;

    if (this.props.language === 'json') {
      const pos = err.message.indexOf('at position ');
      if (pos !== -1) {
        start = parseInt(err.message.substr(pos + 12)) + 1;
        end = start + 1;
      }
    }

    if (this.props.language === 'jsonata') {
      end = err.position + 1;
      start = end - (err.token ? err.token.length : 1);
    }

    if (this.monacoEditor != null && start !== end) {
      this.addErrorDecoration(start, end);
    }
  }

  /**
   * This method is called when a component is being removed from the DOM
   *
   */
  componentWillUnmount() {
    this.monacoEditor = null;
    this.monaco = null;
  }

  /**
   * An event emitted when the editor has been mounted (similar to componentDidMount of React).
   *
   */
  editorDidMount(editor, monaco) {
    editor.decorations = [];
    if (this.props.language === 'jsonata') {
      registerJsonataLanguage(monaco);
      monaco.editor.setModelLanguage(editor.getModel(), 'jsonata');
      editor.addAction({
        id: 'jsonata-lambda',
        label: 'Lambda',
        keybindings: [monaco.KeyCode.F11],
        run: function (ed) {
          ed.trigger('keyboard', 'type', { text: 'λ' });
          return null;
        },
      });
    }
    this.monacoEditor = editor;
    this.monaco = monaco;

    // Bubble up the event
    if (this.props.editorDidMount) {
      this.props.editorDidMount(this, monaco);
    }
  }

  render() {
    const {
      width,
      height,
      readOnly,
      value,
      formatEnabled,
      downloadEnabled,
      downloadCSVEnabled,
      label,
      options = {},
      editorDidMount,
      className,
      ...other
    } = this.props;

    return (
      <div className={className}>
        <Notification ref={this.notificationElement} autodismiss={true} delay={3000}></Notification>
        <EditorNav
          key={`nav-${label}`}
          label={label}
          formatEnabled={formatEnabled}
          downloadEnabled={downloadEnabled}
          downloadCSVEnabled={downloadCSVEnabled}
          onFormatClick={this._onFormatClick}
          onDownloadClick={this._onDownloadClick}
          onDownloadCSVClick={this._onDownloadCSVClick}
        />
        <ReactResizeDetector
          handleWidth
          handleHeight
          onResize={() => {
            this.layout();
          }}
        >
          <MonacoEditor
            key={`editor-${label}`}
            width={width || '100%'}
            height={height || '100%'}
            value={value}
            options={{
              ...options,
            }}
            {...other}
            editorDidMount={this.editorDidMount}
          />
        </ReactResizeDetector>
      </div>
    );
  }
}

EnhancedEditorWithNav.propTypes = {
  editorDidMount: PropTypes.func,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  options: PropTypes.object,
  value: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  formatEnabled: PropTypes.bool,
  downloadEnabled: PropTypes.bool,
  downloadCSVEnabled: PropTypes.bool,
  label: PropTypes.string,
};

EnhancedEditorWithNav.defaultProps = {
  className: 'enhanced-editor',
  formatEnabled: true,
  downloadEnabled: true,
  downloadCSVEnabled: false,
  label: 'Editor',
};

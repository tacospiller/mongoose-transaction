'use strict';
require('songbird');

const mongoose = require('mongoose');

const wrapMongoOp = function wrapMongoOp(op) {
    let key, val;
    for (key in op) {
        if (op.hasOwnProperty(key)) {
            val = op[key];
            if (val === null || val === undefined) {
                continue;
            } else if (val instanceof mongoose.Types.ObjectId) {
                op[key] = {$oid: val.toString()};
            } else if (op[key] instanceof Date) {
                op[key] = {$date: +val};
            } else if (Array.isArray(val) || typeof val === 'object') {
                wrapMongoOp(val);
            }
        }
    }
    return op;
};

const unwrapMongoOp = function unwrapMongoOp(op) {
    let key, val;
    for (key in op) {
        if (op.hasOwnProperty(key)) {
            val = op[key];
            if (Array.isArray(val)) {
                unwrapMongoOp(val);
            } else if (val === null || val === undefined) {
                continue;
            } else if (typeof val === 'object') {
                if (val.hasOwnProperty('$oid')) {
                    op[key] = new mongoose.Types.ObjectId(val.$oid);
                } else if (val.hasOwnProperty('$date')) {
                    op[key] = new Date(val.$date);
                } else {
                    unwrapMongoOp(val);
                }
            }
        }
    }
    return op;
};

const _checkExcludeOnly = function(fields) {
    let ret = fields.some(function(field) {
        if (field.indexOf('-') === 0) {
            return;
        }
        return true;
    });
    return !ret;
};

let _filterExcludedField = function(fields, blacklist) {
    let excludedFields = JSON.parse(JSON.stringify(fields));

    let _excludedFields = [];
    blacklist.forEach(function(field) {
        let parentField;
        let topField;
        if (field.indexOf('.') < 0) {
            parentField = field;
            topField = field;
        } else {
            parentField = field.split('.').slice(0, -1).join('.');
            topField = field.split('.')[0];
        }

        let idx = [];
        for (let i = 0; i < excludedFields.length; i += 1) {
            if (excludedFields[i].indexOf('.') < 0) {
                if (excludedFields[i] === topField) {
                    idx.push(i);
                }
            } else {
                if (excludedFields[i].indexOf(parentField + '.') === 0) {
                    idx.push(i);
                }
            }
        }

        if (idx.length > 0) {
            for (let j = 0; j < excludedFields.length; j += 1) {
                if (idx.indexOf(j) < 0) {
                    _excludedFields.push(excludedFields[j]);
                }
            }
            excludedFields = _excludedFields;
        }
    });

    return excludedFields;
};

const _mergeStringFields = function(srcFields, defaultFields) {
    let excludedFields = [];
    srcFields.forEach(function(field) {
        excludedFields.push(field.slice(1));
    });
    excludedFields = _filterExcludedField(excludedFields, defaultFields);
    excludedFields = excludedFields.map(function(field) {
        return '-' + field;
    });
    return excludedFields.join(' ');
};

function _cleanUpObjectFields(fields) {
    let excludedFields = [];
    let includedFields = [];
    Object.keys(fields).forEach(function(field) {
        if (fields[field]) {
            includedFields.push(field);
        } else {
            excludedFields.push(field);
        }
    });

    if (excludedFields.length === 0 || includedFields.length === 0) {
        return fields;
    }

    excludedFields = _filterExcludedField(excludedFields, includedFields);

    let ret = {};
    excludedFields.forEach(function(field) {
        ret[field] = 0;
    });

    return ret;
}

const setDefaultFields = function(srcFields, defaultFields) {
    if (!srcFields) {
        return srcFields;
    }

    switch (typeof srcFields) {
        case 'string':
            let fieldArray = srcFields.split(' ');
            if (_checkExcludeOnly(fieldArray)) {
                return _mergeStringFields(fieldArray, defaultFields);
            }
            defaultFields.forEach(function(field) {
                if (!field) {
                    return;
                }
                if (fieldArray.indexOf(field) < 0) {
                    fieldArray.push(field);
                }
            });
            return fieldArray.join(' ');
        case 'object':
            if (!Object.keys(srcFields).length) {
                return srcFields;
            }
            defaultFields.forEach(function(field) {
                if (!field) {
                    return;
                }
                if (!srcFields[field]) {
                    srcFields[field] = 1;
                }
            });
            return _cleanUpObjectFields(srcFields);
        default:
            return srcFields;
    }
};

const extractDelta = function(doc) {
    return (doc.$__delta() || [null, {}])[1];
};

const NODE_VERSIONS =
        process.version.replace('v', '').split('.').map(Math.floor);

let nextTick;
if (NODE_VERSIONS[0] >= 0 && NODE_VERSIONS[1] >= 10) {
    if (global.setImmediate) {
        nextTick = global.setImmediate;
    } else {
        let timers = require('timers');
        if (timers.setImmediate) {
            nextTick = function() {
                timers.setImmediate.apply(this, arguments);
            };
        }
    }
}

const DEBUG = function() {
    if (global.TRANSACTION_DEBUG_LOG) {
        console.log.apply(console, arguments);
    }
};

const addShardKeyDatas = function(pseudoModel, src, dest) {
    if (!pseudoModel || !pseudoModel.shardKey ||
            !Array.isArray(pseudoModel.shardKey)) {
        return;
    }
    pseudoModel.shardKey.forEach(function(sk) { dest[sk] = src[sk]; });
};

const removeShardKeySetData = function(shardKey, op) {
    if (!shardKey || !Array.isArray(shardKey)) {
        return;
    }
    if (!op.$set) {
        return;
    }
    shardKey.forEach(function(sk) {
        delete op.$set[sk];
    });
};

const sleep = ((microsec, callback) => {
    if (microsec <= 0) {
        return (nextTick || process.nextTick)(callback);
    }
    setTimeout(callback, microsec);
}).promise;

module.exports = {
    wrapMongoOp: wrapMongoOp,
    unwrapMongoOp: unwrapMongoOp,
    setDefaultFields: setDefaultFields,
    extractDelta: extractDelta,
    nextTick: nextTick || process.nextTick,
    DEBUG: DEBUG,
    addShardKeyDatas: addShardKeyDatas,
    removeShardKeySetData: removeShardKeySetData,
    sleep: sleep,
};
// vim: et ts=5 sw=4 sts=4 colorcolumn=80

/*

 ----------------------------------------------------------------------------
 | rippleosi-ewd3: EWD3/ewd-xpress Middle Tier for Ripple OSI               |
 |                                                                          |
 | Copyright (c) 2016 Ripple Foundation Community Interest Company          |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://rippleosi.org                                                     |
 | Email: code.custodian@rippleosi.org                                      |
 |                                                                          |
 | Author: Rob Tweed, M/Gateway Developments Ltd                            |
 |                                                                          |
 | Licensed under the Apache License, Version 2.0 (the "License");          |
 | you may not use this file except in compliance with the License.         |
 | You may obtain a copy of the License at                                  |
 |                                                                          |
 |     http://www.apache.org/licenses/LICENSE-2.0                           |
 |                                                                          |
 | Unless required by applicable law or agreed to in writing, software      |
 | distributed under the License is distributed on an "AS IS" BASIS,        |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. |
 | See the License for the specific language governing permissions and      |
 |  limitations under the License.                                          |
 ----------------------------------------------------------------------------

18 October 2016

*/

var mySQL = require('./mySQL');
var template = require('./template');
var dateTime = require('./dateTime');

var count;

function getDepartments(callback) {
  var deptsCache = new this.documentStore.DocumentNode('rippleMedicalDepts');

  var query = 'SELECT * FROM medical_departments';
  mySQL.query(query, function(depts) {
    if(depts.error) {
      callback(depts.error);
      return;
    }
    depts.forEach(function(dept) {
      deptsCache.$(dept.id).setDocument(dept);
    });
    if (callback) callback();
  });
}

function getGPs(callback) {
  var gpCache = new this.documentStore.DocumentNode('rippleGPs');

  var query = 'SELECT * FROM general_practitioners';
  mySQL.query(query, function(gps) {
    if(gps.error) {
      callback(gps.error);
      return;
    }
    gps.forEach(function(gp) {
      gpCache.$(gp.id).setDocument(gp);
    });
    if (callback) callback();
  });
}

function formatPatientData(row) {

  var gpCache = new this.documentStore.DocumentNode('rippleGPs');
  var deptCache = new this.documentStore.DocumentNode('rippleMedicalDepts');

  var patient = {};
  patient.id = row.nhs_number;
  patient.nhsNumber = row.nhs_number;
  patient.name = row.first_name + ' ' + row.last_name;
  var address = '';
  var comma = ' ';
  if (row.address_1) {
    address = row.address_1;
    comma = ', ';
  }
  if (row.address_2) {
    address = address + comma + row.address_2;
    comma = ', ';
  }
  if (row.address_3) {
    address = address + comma + row.address_3;
    comma = ', ';
  }
  if (row.address_4) {
    address = address + comma + row.address_4;
    comma = ', ';
  }
  if (row.address_5) {
    address = address + comma + row.address_5;
    comma = ', ';
  }
  if (row.postcode) {
    address = address + comma + row.postcode;
    comma = ', ';
  }
  patient.address = address;
  patient.dateOfBirth = new Date(row.date_of_birth).getTime();
  patient.gender = row.gender;
  patient.phone = row.phone;
  patient.gpDetails = gpCache.$(row.gp_id).$('gp_name').value;
  patient.pasNo = row.pas_number;
  patient.department = deptCache.$(row.department_id).$('department').value;
  return patient;
}

function advancedSearch(params, callback) {

  if (!params.surname || params.surname === '') {
    if (callback) callback ({error: 'Missing or invalid surname'});
    return;
  }
  if (!params.forename || params.forename === '') {
    if (callback) callback ({error: 'Missing or invalid forename'});
    return;
  }
  if (!params.dateOfBirth || params.dateOfBirth === '') {
    if (callback) callback ({error: 'Missing or invalid dateOfBirth'});
    return;
  }
  params.dateOfBirth = dateTime.toSqlPASFormat(params.dateOfBirth);

  var query = 'SELECT * FROM patients P WHERE P.first_name LIKE \'{{forename}}%\' AND P.last_name LIKE \'{{surname}}%\' AND P.date_of_birth = \'{{dateOfBirth}}\'';
  if (params.gender && params.gender !== '') {
    query = query + ' AND P.gender EQUALS \'{{gender}}\'';
  }
  query = template.replace(query, params);
  var q = this;  

  mySQL.query(query, function(rows) {
    if(rows.error) {
      if (callback) callback(rows);
      return;
    }
    var results = [];
    rows.forEach(function(row) {
      results.push(formatPatientData.call(q, row));
    });
    if (callback) callback(results);
  });
}

function searchByPatient(searchString, callback) {
  var pieces = searchString.split(' ');
  var lastName = pieces[0];
  var firstName = pieces[1];
  var dateOfBirth = pieces[2];

  var query = 'SELECT * FROM patients P WHERE P.last_name LIKE \'{{lastName}}%\'';
  if (firstName && firstName !== '') {
    query = query + ' AND P.first_name LIKE \'{{firstName}}%\'';
  }
  if (dateOfBirth && dateOfBirth !== '') {
    query = query + ' AND P.date_of_birth = \'{{dateOfBirth}}\'';
  }
  //if (params.gender && params.gender !== '') {
  //  query = query + ' AND P.gender EQUALS \'{{gender}}\'';
  //}

  var params = {
    firstName: firstName,
    lastName: lastName,
    dateOfBirth: dateOfBirth
  };

  var q = this;
  query = template.replace(query, params);

  mySQL.query(query, function(rows) {
    if(rows.error) {
      if (callback) callback(rows);
      return;
    }
    var patientDetails = [];
    var noOfPatients = 0;
    rows.forEach(function(row) {
      noOfPatients++;
      var record = formatPatientData.call(q, row);
      var patient = {
        source: 'local',
        sourceId: record.id,
        name: record.name,
        address: record.address,
        dateOfBirth: record.dateOfBirth,
        gender: record.gender,
        nhsNumber: record.nhsNumber
      };
      patientDetails.push(patient);
    });
    var results = {
      totalPatients: noOfPatients,
      patientDetails: patientDetails
    };
    if (callback) callback(results);
  });
}

function getAllPatients(callback) {

  var q = this;
  var query = 'SELECT * FROM patients';
  mySQL.query(query, function(patients) {
    if(patients.error) {
      callback(patients);
      return;
    }
    var results = {};
    patients.forEach(function(row) {
      results[row.nhs_number] = formatPatientData.call(q, row);
    });
    if (callback) callback(results);
  });
}

function getPatients(callback) {

  var q = this;

  var getAllPatientsFn = function() {
    getAllPatients.call(q, callback);
  };

  count = 0;
  getDepartments.call(this, function(error) {
    if (error) {
      callback({error: error});
      return;
    }
    q.emit('mySQLResultsReady', getAllPatientsFn);
  });

  getGPs.call(this, function(error) {
    if (error) {
      callback({error: error});
      return;
    }
    q.emit('mySQLResultsReady', getAllPatientsFn);
  });

}

module.exports = {
  init: function() {
    var q = this;

    this.on('mySQLResultsReady', function(callback) {
      count++;
      console.log('mySQLResultsReady event - count = ' + count);
      if (count === 2) {
        if (callback) callback.call(q);
        return;
      }
    });
  },
  getPatients: getPatients,
  advancedSearch: advancedSearch,
  searchByPatient: searchByPatient
};

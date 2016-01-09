
var _ = require("lodash");
var latestAsync = require("async");

var internalConfig = require("./config");

module.exports = function(externalConfig){

	var panoptoConfig = {
		soap_base : externalConfig.server_protocol + "://" + externalConfig.server_base
	}
	var panopto = require("manual-panopto-api")(panoptoConfig);
	var ep = panopto.endpoints;
	var proxyDetails = externalConfig.proxy_account;
	var proxyAuth = {
		UserKey:proxyDetails.UserKey,
		Password:proxyDetails.Password
	}
	var proxyGuid = null;

	function init(cb){
		return cb();
	}

	function getProxyGuid(cb){
		if(proxyGuid){
			cb(null,proxyGuid);
		}else{
			var params = {
				auth:proxyAuth,
				userKey:proxyAuth.UserKey
			}
			ep.UserManagement.getUserByKey(params,function(err,response){
				if(err){
					return cb(err);
				}
				proxyGuid = response[0].GetUserByKeyResponse[0].GetUserByKeyResult[0].UserId[0];
				cb(err,proxyGuid);
			});
		}
	}

	function setProxyGuid(guid){
		proxyGuid = guid;
	}


	function refreshLogin(synoteUser,cb){
		//Send request to blackboard server
	}

	//TODO: Upload transcript

	function getUserCreatorCollections(inputUser,cb){
		var authCode = _generateAuthCode(inputUser);

		var params = {
			auth:{
				UserKey:inputUser,
				AuthCode:authCode
			}
		}

		
		ep.AccessManagement.GetSelfUserAccessDetails(params,function(err,response){
			if(err){
				return cb(err);
			}

			var resp =  response[0].GetSelfUserAccessDetailsResponse[0].GetSelfUserAccessDetailsResult[0];

			var total = [];

			var creatorFolders = resp.FoldersWithCreatorAccess[0].guid
			if(creatorFolders){
				total = _setConcat(total,creatorFolders);
			}
			console.log(total);

			var groups = resp.GroupMembershipAccess[0].GroupAccessDetails;
			_.forEach(groups,function(group){
				var creatorFs = group.FoldersWithCreatorAccess[0].guid;
				if(creatorFs){
					total = _setConcat(total,creatorFs);
				}
			});

			params.folderIds = total;

			ep.SessionManagement.GetFoldersById(params,function(err,response){
				if(err){
					return cb(err);
				}

				var folders = response[0].GetFoldersByIdResponse[0].GetFoldersByIdResult[0].Folder;
				var results = [];
				_.forEach(folders,function(folder){
					results.push(_extractFolder(folder));
				});
				cb(null,results);
			});

		});
	}

	function getCollectionDetails(collectionId,inputUser,cb){
		var authCode = _generateAuthCode(inputUser);

		var params = {
			auth:{
				UserKey:inputUser,
				AuthCode:authCode
			},
			folderIds:[collectionId]
		}

		ep.SessionManagement.GetFoldersById(params,function(err,response){
			if(err){
				return cb(err);
			}

			var folder = response[0].GetFoldersByIdResponse[0].GetFoldersByIdResult[0].Folder[0];
			var result =  _extractFolder(folder);

			return cb(null,result);
		});


	}

	//TODO: validate IDs (format - stop xml injection)
	function getCollectionContents(collectionId,cb){
		var params = {
			auth:proxyAuth,
			folderIds:[collectionId]
		}

		ep.SessionManagement.GetFoldersById(params,function(err,response){
			if(err){
				return cb(err);
			}

			var folder = response[0].GetFoldersByIdResponse[0].GetFoldersByIdResult[0].Folder[0];

			var params = {
				auth:proxyAuth,
				request:{
					folderId:collectionId,
					states:{
						sessionState:"Complete"
					}
				}
			}

			
			ep.SessionManagement.GetSessionsList(params,function(err,response){
				if(err){
					return cb(err);
				}

				var sessionResults = [];

				var sessions = response[0].GetSessionsListResponse[0].GetSessionsListResult[0].Results[0].Session;
				_.forEach(sessions,function(session){
					sessionResults.push(_extractSession(session));
				});

				var folderResult = _extractFolder(folder);
				folderResult.recordings = sessionResults;
			
				cb(null,folderResult);
			});

		});

	}


	/*
	function getRecordings(recordingIds,cb){
		var params = {
			auth:proxyAuth,
			sessionIds:recordingIds
		}

		ep.SessionManagement.GetSessionsById(params,function(err,response){
			if(err){
				return cb(err);
			}

			var results = [];
			var sessions = response[0].GetSessionsByIdResponse[0].GetSessionsByIdResult[0].Session;
			_.forEach(sessions,function(session){
				var complete = session.State[0] === "Complete";
				if(complete){
					results.push(_extractSession(session));
				}
			});

			cb(null,results);

		});

	}
	*/

	function _extractFolder(folder){
		var result = {
			inputId : folder.Id[0],
			name : folder.Name[0],
			description : folder.Description[0],
		};
		return result;
	}

	function _extractSession(session){
		var complete = session.State[0] === "Complete";
		var result = {
			inputId : session.Id[0],
			name : session.Name[0],
			description : session.Description[0],
			creatorId : session.CreatorId[0],
			collection:{
				inputId:session.FolderId[0],
				name:session.FolderName[0]
			},
			mp3 : session.MP3Url[0],
			mp4 : session.MP4Url[0],
			startTime : session.StartTime[0],
			duration : session.Duration[0],
			thumbUrl : session.ThumbUrl[0],
			complete : complete
		};

		return result;
	}

	function _setConcat(current,additions){
		var fresh = _.difference(additions, current);
		return current.concat(fresh);

	}


	function trackCollection(collectionId,inputUser,cb){
		var authCode = _generateAuthCode(inputUser);

		var params = {
			auth:proxyAuth
		}

		ep.AccessManagement.GetSelfUserAccessDetails(params,function(err,response){
			if(err){
				return cb(err);
			}

			var resp = response[0].GetSelfUserAccessDetailsResponse[0].GetSelfUserAccessDetailsResult[0];

			var guid = resp.UserId[0];
			setProxyGuid(guid);

			var total = [];
			var creatorFolders = resp.FoldersWithCreatorAccess[0].guid;
			var viewerFolders = resp.FoldersWithViewerAccess[0].guid;

			if(creatorFolders){
				total = _setConcat(total,creatorFolders);
			}

			if(viewerFolders){
				total = _setConcat(total,viewerFolders);
			}

			if(_.includes(total,collectionId)){
				return cb(null,false);
			}else{

				var CREATOR = "Creator";
				var VIEWER = "Viewer";

				var params = {
					auth:{
						UserKey:inputUser,
						AuthCode:authCode
					},
					folderId:collectionId,
					userIds:[guid],
					role:VIEWER
				}
				ep.AccessManagement.GrantUsersAccessToFolder(params,function(err,response){
					if(err){
						cb(err);
					}else{
						cb(null,true);
					}
				});

			}

		});

	}

	/*
	function canViewCollection(inputUser,collectionId,cb){
		return _canAccess(inputUser,collectionId,true,cb);
	};

	function isCollectionCreator(inputUser, collectionId, cb){
		return _canAccess(inputUser,collectionId,false,cb);
	};
	*/

	function canViewByCollection(inputRecordings,inputUser,cb){
		_.forEach(inputRecordings,function(rec){
			rec.canView = false;
		});

		var output = [];

		_getCollectionAccess(inputUser,true,function(err,collectionIds){
			if(err){
				return cb(err);
			}

			_.forEach(inputRecordings,function(rec){
				if(_.includes(collectionIds,rec.collection)){
					rec.canView = true;
					output.push(rec);
				}
				
			});

			cb(null,output);
		});
	}

	function canViewByRecording(inputRecordings,inputUser,cb){
		_.forEach(inputRecordings,function(rec){
			rec.canView = false;
		});



		var byCollection = _.groupBy(inputRecordings,'collection.inputId');
		var authCode = _generateAuthCode(inputUser);

		var output = [];

		latestAsync.forEachOf(byCollection, function (recordings, collectionId, callback) {

			var params = {
				auth:{
					UserKey:inputUser,
					AuthCode:authCode
				},
				request:{
					folderId:collectionId,
					states:{
						sessionState:"Complete"
					}
				}
			}
			
			ep.SessionManagement.GetSessionsList(params,function(err,response){
				if(err){
					return callback(null,false);
				}

				var sessionIds = [];

				var sessions = response[0].GetSessionsListResponse[0].GetSessionsListResult[0].Results[0].Session;
				_.forEach(sessions,function(session){
					sessionIds.push(session.Id[0]);
				});

				_.forEach(recordings,function(rec){
					if(_.includes(sessionIds,rec.inputId)){
						rec.canView = true;
						output.push(rec);
					}
				});

				callback(null,true);
			});
		  
		}, function (err) {
		  if (err){
		  	return cb(err);
		  }
		  
		  cb(null,output);
		});
	}

	/*
	function canViewRecording(inputUser,recordingId,cb){
		var authCode = _generateAuthCode(inputUser);
		var params = {
			auth:{
				UserKey:inputUser,
				AuthCode:authCode
			},
			sessionIds:[recordingId]
		}
		ep.SessionManagement.GetSessionsById(params,function(err,response){
			if(err){
				cb(null,false);
			}else{
				var id = response[0].GetSessionsByIdResponse[0].GetSessionsByIdResult[0].Session[0].Id[0];
				if(id===recordingId){
					cb(null,true);
				}else{
					cb("Returned ID did not match",false);
				}
			}
		});
	}
	*/

	function _generateAuthCode(inputUser){
		return panopto.util.generateAuthCode(inputUser,externalConfig.server_base,externalConfig.secret);
	}

	
	function _getCollectionAccess(inputUser, viewer, cb){
		var authCode = _generateAuthCode(inputUser);

		var params = {
			auth:{
				UserKey:inputUser,
				AuthCode:authCode
			}
		}
		ep.AccessManagement.GetSelfUserAccessDetails(params,function(err,response){
			if(err){
				return cb(err);
			}

			var resp =  response[0].GetSelfUserAccessDetailsResponse[0].GetSelfUserAccessDetailsResult[0];

			var total = [];

			var creatorFolders = resp.FoldersWithCreatorAccess[0].guid
			if(creatorFolders){
				total = _setConcat(total,creatorFolders);
			}

			var viewerFolders = resp.FoldersViewerCreatorAccess[0].guid
			if(viewer && viewerFolders){
				total = _setConcat(total,viewerFolders);
			}

			var groups = resp.GroupMembershipAccess[0].GroupAccessDetails;
			_.forEach(groups,function(group){
				var creatorFs = group.FoldersWithCreatorAccess[0].guid;
				if(creatorFs){
					total = _setConcat(total,creatorFs);
				}

				var viewerFs = group.FoldersWithViewerAccess[0].guid;
				if(viewer && viewerFs){
					total = _setConcat(total,viewerFs);
				}
			});

			cb(null,total);

		});
	}
	



	return {
		trackCollection : trackCollection,
		getCollectionContents : getCollectionContents,
		getCollectionDetails : getCollectionDetails,
		//getRecordings : getRecordings,
		canViewByRecording : canViewByRecording,
		canViewByCollection : canViewByCollection,
		getUserCreatorCollections : getUserCreatorCollections,
		refreshLogin : refreshLogin,
		config : internalConfig,
		init : init
	}

}


/*

//Web hooks
module.exports.onAddRecording = function(eventFunction){

};
*/

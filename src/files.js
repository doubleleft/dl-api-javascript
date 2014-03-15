/**
 * @module DL
 * @class DL.Files
 */
DL.Files = function(client) {
  this.client = client;
};

/**
 * @return {Promise}
 */
DL.Files.prototype.upload = function(data, fileName, mimeType){
  var formData = new FormData();
  if(data instanceof HTMLCanvasElement && data.toBlob){
	var deferred = when.defer();
    var self = this;
    data.toBlob(function(blob){
      self.upload(blob, fileName, mimeType).then(deferred.resolver.resolve, deferred.resolver.reject);
    }, mimeType || "image/png");

	return deferred.promise;
  }
  formData.append('file', data, fileName || "dlApiFile");
  return this.client.post('files', formData);
};

/**
 * @return {Promise}
 */
DL.Files.prototype.get = function(_id) {
  return this.client.get('files', { _id: _id });
};

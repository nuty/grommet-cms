import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import File from '../models/File';
import Post from '../models/Post';
import mkdirp from 'mkdirp';
import { slugifyFile } from '../utils/slugify';
import { isAuthed } from '../middleware/auth';
import mongoose from 'mongoose';

const router = express.Router();
const currYear = new Date().getFullYear();
const currMonth = new Date().getMonth() + 1;
const uploadsDir = path.join(__dirname, '..', '..');

// Setup file multer storage.
const storage = multer.diskStorage({
  destination: function (req, file, callback) {
    const destPath = `./uploads/media/${currYear}/${currMonth}`;

    // Check if destination directory exists, if not make one.
    if (!fs.existsSync(destPath)) {
      mkdirp(destPath, (err) => {
        if (err) console.log(`Make directory error: ${err}`);
        callback(null, destPath);
      });
    } else {
      callback(null, destPath);
    }
  },
  filename: function (req, file, callback) {
    // slugifyFile method will slugify and time stamp a file name.
    callback(null, slugifyFile(file.originalname));
  }
});
const upload = multer({storage: storage});

// Edit file
router.post('/file/edit/:id', isAuthed, upload.single('file'), function (req, res) {
  File.findById(req.params.id, function (err, file) {
    if (err) {
      return res.status(400).send(err);
    }
    const filePath = (req.file !== undefined) 
      ? '/' + req.file.path
      : file.path;

    if (req.file !== undefined) {
      // Delete previous file.
      fs.unlinkSync(`${uploadsDir}${file.path}`);
      console.log(`${uploadsDir}${file.path}`);
    }

    file.path = filePath;
    file.title = req.body.title;

    return file.save(function(err) {
      if (err) return res.status(400).send(err);
      
      return res.status(200).send(file);
    });
  });
});

// Create file
router.post('/file/create', isAuthed, upload.single('file'), 
  function(req, res) {
    const filePath = (req.file !== undefined) 
      ? '/' + req.file.path 
      : null;

    File.create({
      title: req.body.title || '',
      path: filePath,
      createdBy: req.user.username || 'admin',
      createdAt: Date.now()
    }, function (err, post) {
      if (err) {
        console.log(`File error: ${err}, ${post}`);
        return res.status(400).send(err);
      }
      return res.status(200).send(post);
    });
  }
);

// Get files
router.get('/files', isAuthed, function(req, res) {
  const page = req.query.page || 0;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 12;
  const searchTermQuery = req.query.searchTerm || '';
  const pageIdQuery = req.query.pageId || '';
  const orderBy = req.query.orderBy || 'createdAt';
  const ascending = req.query.ascending === 'true' || false;
  const skip = (page <= 1)
    ? 0
    : (page - 1) * limit;
  if (pageIdQuery !== '') {
    Post
    .Post
    .findById(new mongoose.Types.ObjectId(pageIdQuery))
    .exec((err, post) => {
      if (err) {
        return res.status(400).send(err);
      }

      let query = {};
      if (searchTermQuery !== '') {
        query = {
          $or: [
            {
              path: {
                $regex: new RegExp(searchTermQuery),
                $options: 'i'
              }
            },
            {
              title: {
                $regex: searchTermQuery,
                $options: 'i'
              }
            }
          ]
        };
      }

      File.find(query)
        .where('_id')
        .in(post.assets)
        .sort({ [orderBy]: ascending ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .exec(
          function(err, files) {
            if (err) {
              return res.status(400).send(err);
            }

            return res.status(200).send(files);
          }
        );
    });
  } else {
    File.find({
      $or: [
        {
          path: {
            $regex: new RegExp(searchTermQuery),
            $options: 'i'
          }
        },
        {
          title: {
            $regex: searchTermQuery,
            $options: 'i'
          }
        }
      ]
    })
      .skip(skip)
      .limit(limit)
      .sort({ [orderBy]: ascending ? 1 : -1 })
      .exec(
        function(err, files) {
          if (err) {
            return res.status(400).send(err);
          }

          return res.status(200).send(files);
        }
      );
  }

});

router.get('/assets-count', function(req, res) {
  const searchTermQuery = req.query.searchTerm || '';
  const pageIdQuery = req.query.pageId || '';
  if (pageIdQuery !== '') {
    Post
    .Post
    .findOne({ "_id": new mongoose.Types.ObjectId(pageIdQuery) })
    .populate('assets')
    .exec((err, post) => {
      if (err) {
        return res.status(400).send(err);
      }
      
      let query = {};
      if (searchTermQuery !== '') {
        query = {
          title: {
            $regex: searchTermQuery,
            $options: 'i'
          }
        };
      }

      File.find(query)
        .where('_id')
        .in(post.assets)
        .exec(
          function(err, files) {
            if (err) {
              return res.status(400).send(err);
            }

            return res.status(200).send({ total: files.length });
          }
        );
    });
  } else {
    File.find({
      title: {
        $regex: searchTermQuery,
        $options: 'i'
      }
    })
      .exec(
        function(err, files) {
          if (err) {
            return res.status(400).send(err);
          }

          const count = files.length;

          return res.status(200).send({ total: count });
        }
      );
  }
});


// Get file (unprotected)
router.get('/file', function (req, res) {
  const id = (req.query.id)
    ? req.query.id
    : 0;

  File.findById(id, function (err, file) {
    if (err) {
      return res.status(400).send(err);
    }

    return res.status(200).send(file);
  });
});

// Delete File
router.post('/file/:id/delete', isAuthed, function(req, res) { 
  File.findOne({'_id' : req.params.id }).exec(function(err, file) {
    if (err) {
      return res.status(400).send(err);
    }

    if (file && file.path !== undefined) {
      // Delete file.
      console.log(`${uploadsDir}${file.path}`);
      fs.unlinkSync(`${uploadsDir}${file.path}`);
    }

    return file.remove((err) => res.status(200).send('success'));
  });
});

export default router;
